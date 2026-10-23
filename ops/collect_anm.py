#!/usr/bin/env python3
"""Stream, validate and atomically publish an ANM generation using bounded memory."""
import argparse, datetime, fcntl, hashlib, json, os, pathlib, shutil, struct, subprocess, tempfile, time, uuid, zipfile

def validate(archive):
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        names = [e.filename for e in entries]
        if len(entries) > 10000 or len(set(names)) != len(names) or sum(e.file_size for e in entries) > 4 * 1024**3:
            raise ValueError('ZIP exceeds limits or contains duplicate entries')
        for n in names:
            if '\\' in n or n.startswith('/') or '..' in n.split('/'):
                raise ValueError('Unsafe ZIP entry')
        for name in ['BRASIL.shp', 'BRASIL.dbf', 'BRASIL.shx', 'BRASIL.prj']:
            if name not in names or not z.getinfo(name).file_size:
                raise ValueError('Missing required member: ' + name)
        # testzip streams entries and checks their CRC without loading large members into RAM.
        if z.testzip() is not None:
            raise ValueError('ZIP CRC mismatch')
        with z.open('BRASIL.shp') as f:
            h = f.read(100)
        if len(h) != 100 or struct.unpack('>i', h[:4])[0] != 9994 or struct.unpack('<i', h[28:32])[0] != 1000 or struct.unpack('>i', h[24:28])[0] * 2 != z.getinfo('BRASIL.shp').file_size:
            raise ValueError('Invalid SHP header or size')
        with z.open('BRASIL.dbf') as f:
            h = f.read(32)
            if len(h) != 32:
                raise ValueError('Invalid DBF header')
            count, header, length = struct.unpack('<IHH', h[4:12])
            if not count or header < 33 or not length or header + count * length > z.getinfo('BRASIL.dbf').file_size:
                raise ValueError('Empty or truncated DBF')
            tail = f.read(header - 32)
            if len(tail) != header - 32 or tail[-1] != 13:
                raise ValueError('Invalid DBF fields')
    return count

def collect(source, storage, filename):
    storage = pathlib.Path(storage).resolve()
    storage.mkdir(parents=True, exist_ok=True)
    if pathlib.Path(filename).name != filename:
        raise ValueError('Invalid publication filename')
    root = storage / '.anm'
    root.mkdir(exist_ok=True)
    with (root / 'collector.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        stage = pathlib.Path(tempfile.mkdtemp(prefix='.partial-', dir=root))
        link = storage / ('.publish-' + uuid.uuid4().hex)
        published = False
        try:
            archive = stage / filename
            # Same User-Agent as the existing successful Axios GET; never use HEAD as proof of download.
            subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '30', '--max-time', '1200', '--max-filesize', str(1024**3), '--user-agent', 'axios/1.13.5', '--output', str(archive), source], check=True)
            downloaded = datetime.datetime.now(datetime.timezone.utc).isoformat()
            records = validate(archive)
            with archive.open('rb') as f:
                digest = hashlib.file_digest(f, 'sha256').hexdigest()
            metadata = dict(source=source, bytes=archive.stat().st_size, sha256=digest, records=records, downloadedAt=downloaded, validatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
            manifest = archive.with_name(archive.name + '.validated.json')
            manifest.write_text(json.dumps(metadata))
            for f in [archive, manifest]:
                os.chmod(f, 0o644)
                with f.open('rb') as fd:
                    os.fsync(fd.fileno())
            os.chmod(stage, 0o755)
            generation = root / ('generation-' + uuid.uuid4().hex)
            os.rename(stage, generation)
            stage = generation
            link.symlink_to(os.path.relpath(generation / filename, storage))
            os.replace(link, storage / filename)
            published = True
            fd = os.open(storage, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
            # Retain recent generations for open HTTP responses and rollback. Disk growth is bounded after a day.
            generations = sorted(root.glob('generation-*'), key=lambda x: x.stat().st_mtime, reverse=True)
            for old in generations[3:]:
                if old != generation and old.stat().st_mtime < time.time() - 86400:
                    shutil.rmtree(old)
            print(json.dumps(metadata), flush=True)
            return metadata
        finally:
            link.unlink(missing_ok=True)
            if not published:
                shutil.rmtree(stage, ignore_errors=True)

def main():
    a = argparse.ArgumentParser()
    a.add_argument('--source', required=True)
    a.add_argument('--storage', required=True)
    a.add_argument('--filename', default='PROCESSOS_MINERARIOS_BRASIL.zip')
    args = a.parse_args()
    if not args.source.startswith('https://'):
        raise ValueError('HTTPS source required')
    collect(args.source, args.storage, args.filename)

if __name__ == '__main__':
    main()
