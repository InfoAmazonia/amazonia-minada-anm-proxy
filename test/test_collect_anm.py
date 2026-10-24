import importlib.util, pathlib, struct, tempfile, unittest, zipfile
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('collector', pathlib.Path(__file__).parents[1] / 'ops/collect_anm.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def fixture(path, kind='valid'):
    shp = bytearray(100); struct.pack_into('>i', shp, 0, 9994); struct.pack_into('>i', shp, 24, 50); struct.pack_into('<i', shp, 28, 1000)
    dbf = bytearray(35); struct.pack_into('<IHH', dbf, 4, 1, 33, 1); dbf[32] = 13
    if kind == 'bad-shape': shp[0] = 3
    if kind == 'empty': struct.pack_into('<I', dbf, 4, 0)
    if kind == 'html': path.write_text('<html>Forbidden</html>'); return
    with zipfile.ZipFile(path, 'w') as z:
        for n, data in [('BRASIL.shp', shp), ('BRASIL.dbf', dbf), ('BRASIL.shx', shp), ('BRASIL.prj', b'projection')]:
            if kind == 'missing' and n == 'BRASIL.dbf': continue
            z.writestr(n, data)
        if kind == 'unsafe': z.writestr('../escape', b'bad')
    if kind == 'truncated': path.write_bytes(path.read_bytes()[:-10])
    if kind == 'crc':
        data = bytearray(path.read_bytes()); offset = data.index(b'PK\x01\x02'); data[offset+16] ^= 1; path.write_bytes(data)

class CollectorTests(unittest.TestCase):
    def test_doh_download_keeps_tls_and_validated_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            def download(cmd, **kw):
                self.assertEqual(cmd[cmd.index('--doh-url')+1], 'https://cloudflare-dns.com/dns-query')
                self.assertEqual(cmd[cmd.index('--user-agent')+1], 'axios/1.13.5')
                self.assertNotIn('--insecure', cmd)
                self.assertNotIn('--doh-insecure', cmd)
                fixture(pathlib.Path(cmd[cmd.index('--output')+1]))
            with patch.object(m.subprocess, 'run', side_effect=download):
                result = m.collect('https://example.test/file', root, 'PROCESSOS_MINERARIOS_BRASIL.zip',
                    doh_url='https://cloudflare-dns.com/dns-query')
            self.assertEqual(result['records'], 1)
            self.assertEqual(result['dnsOverHttps'], 'https://cloudflare-dns.com/dns-query')
            receipt = pathlib.Path(str((root/'PROCESSOS_MINERARIOS_BRASIL.zip').resolve())+'.validated.json')
            self.assertEqual(m.json.loads(receipt.read_text()), result)

    def test_doh_failure_preserves_previous_generation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            def download(cmd, **kw): fixture(pathlib.Path(cmd[cmd.index('--output')+1]))
            with patch.object(m.subprocess, 'run', side_effect=download):
                result = m.collect('https://example.test/file', root, 'PROCESSOS_MINERARIOS_BRASIL.zip')
            target = root/'PROCESSOS_MINERARIOS_BRASIL.zip'
            previous = target.resolve()
            with patch.object(m.subprocess, 'run', side_effect=m.subprocess.CalledProcessError(6, ['curl'])) as run:
                with self.assertRaises(m.subprocess.CalledProcessError):
                    m.collect('https://example.test/file', root, target.name,
                        doh_url='https://cloudflare-dns.com/dns-query')
            self.assertEqual(run.call_count, 1)
            self.assertEqual(target.resolve(), previous)
            self.assertEqual(m.hashlib.sha256(target.read_bytes()).hexdigest(), result['sha256'])
            self.assertFalse(list((root/'.anm').glob('.partial-*')))

    def test_invalid_doh_resolver_is_rejected_before_download(self):
        for url in ['http://resolver.test/query', 'https:///query',
                    'https://user:secret@resolver.test/query', 'https://resolver.test/query#fragment']:
            with self.subTest(url=url), tempfile.TemporaryDirectory() as tmp:
                with patch.object(m.subprocess, 'run') as run, self.assertRaises(ValueError):
                    m.collect('https://example.test/file', tmp, 'PROCESSOS_MINERARIOS_BRASIL.zip', doh_url=url)
                run.assert_not_called()

    def test_success_and_immutable_generation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp); target = root/'PROCESSOS_MINERARIOS_BRASIL.zip'; target.write_bytes(b'previous')
            def download(cmd, **kw): fixture(pathlib.Path(cmd[cmd.index('--output')+1]))
            with patch.object(m.subprocess, 'run', side_effect=download):
                first = m.collect('https://example.test/file', root, target.name); old = target.resolve()
                second = m.collect('https://example.test/file', root, target.name)
            self.assertNotEqual(old, target.resolve()); self.assertTrue(old.exists())
            self.assertEqual(first['sha256'], second['sha256']); self.assertEqual(first['records'], 1)
            self.assertTrue(pathlib.Path(str(target.resolve())+'.validated.json').exists())

    def test_failures_preserve_publication(self):
        for kind in ['http', 'html', 'missing', 'truncated', 'crc', 'unsafe', 'empty', 'bad-shape']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as tmp:
                root = pathlib.Path(tmp); target = root/'PROCESSOS_MINERARIOS_BRASIL.zip'; target.write_bytes(b'previous')
                def download(cmd, **kw):
                    if kind == 'http': raise RuntimeError('HTTP 403')
                    fixture(pathlib.Path(cmd[cmd.index('--output')+1]), kind)
                with patch.object(m.subprocess, 'run', side_effect=download), self.assertRaises(Exception):
                    m.collect('https://example.test/file', root, target.name)
                self.assertEqual(target.read_bytes(), b'previous')
                self.assertFalse(list((root/'.anm').glob('.partial-*')))

if __name__ == '__main__': unittest.main()
