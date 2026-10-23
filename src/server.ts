import express from 'express';
import { CONFIG } from './config.ts';
import { getLogger, InitLogger, InitRequestLogger } from './logger.ts';
import { validatedDownload } from './validated-download.ts';
import { FilesPuller } from './files_puller.ts';

const filesPuller = new FilesPuller();
const app = express();

app.use(express.json());
app.use(InitRequestLogger());

InitLogger();

app.get('/', (req, res) => {
  // Redirect to Amazonia Minada
  res.redirect('https://minada.infoamazonia.org/');
});

app.get("/download/:filename", (req, res) => {
  const { filename } = req.params;
  let storagePath = `./storage/${filename}`;
  if (process.env.ANM_EXTERNAL_COLLECTOR === 'true') {
    if (filename !== CONFIG.urls.ANM.PROCESSOSMINERARIOS_SHAPEFILE_NAME) {
      res.status(404).end();
      return;
    }
    try {
      const validated = validatedDownload(storagePath);
      storagePath = validated.file;
      res.set(validated.headers);
    } catch (error) {
      getLogger().error('ANM file has no valid publication receipt');
      res.status(503).send('Validated ANM file unavailable');
      return;
    }
  }
  res.download(storagePath, (err) => {
    if (err) {
      getLogger().error(`Error sending file ${filename}: ${err}`);
      res.status(500).send('Error downloading file');
    } else {
      console.log(`File ${filename} downloaded successfully`);
    }
  });
});

app.listen(CONFIG.appPort, () => {
  if (process.env.ANM_EXTERNAL_COLLECTOR !== 'true') filesPuller.init();
  console.log(`Server is running at http://localhost:${CONFIG.appPort}`);
});
