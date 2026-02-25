import express from 'express';
import { CONFIG } from './config';
import { getLogger, InitLogger, InitRequestLogger } from './logger';
import { FilesPuller } from './files_puller';

const filesPuller = new FilesPuller();
const app = express();

app.use(express.json());
app.use(InitRequestLogger());

InitLogger();

app.get('/', (req, res) => {
  // Redirect to Amazonia Minada
  res.redirect('https://minada.infoamazonica.com.br/');
});

app.get("/download/:filename", (req, res) => {
  const { filename } = req.params;
  const storagePath = `./storage/${filename}`;
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
  filesPuller.init();
  console.log(`Server is running at http://localhost:${CONFIG.appPort}`);
});
