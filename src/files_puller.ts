import { CONFIG } from './config';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { promisify } from 'util';
import * as stream from 'stream';
import { getLogger } from './logger';

const finishedDownload = promisify(stream.finished);

export class FilesPuller {
    private timer: NodeJS.Timeout = null as any;

    async init() {
        this.timer = setInterval(() => {
            this.pullAll();
        }, CONFIG.syncInterval);

        this.pullAll();
    }

    async pullAll() {
        getLogger().info('Starting files pull process');
        await this.pullANMProcessosMinerarios();
    }

    async pullANMProcessosMinerarios() {              
        getLogger().info('Pulling ANM Processos Minerarios file');

        this.checkStorageDir();

        if(CONFIG.urls.ANM.PROCESSOSMINERARIOS_SHAPEFILEURL && CONFIG.urls.ANM.PROCESSOSMINERARIOS_SHAPEFILE_NAME) {
            const destFilePath = path.join('./storage', CONFIG.urls.ANM.PROCESSOSMINERARIOS_SHAPEFILE_NAME);
            const url = CONFIG.urls.ANM.PROCESSOSMINERARIOS_SHAPEFILEURL;

            try {
                await this.downloadFile(url, destFilePath);
                getLogger().info(`Downloaded file from ${url} to ${destFilePath}`);
                return;
            } catch (error) {
                process.stdout.write('\n');
                console.error('Error downloading file:', error);
                return undefined;
            }
        }
    }

    private async downloadFile(url: string, destFilePath: string) {
        const response = await axios.get(url, { responseType: 'stream' });
        const totalSize = Number(response.headers['content-length']);
        let downloaded = 0;
        // Always overwrite existing files
        const writer = fs.createWriteStream(destFilePath, { flags: 'w' });

        response.data.on('data', (chunk: Buffer) => {
            downloaded += chunk.length;
            if (totalSize) {
                const percent = ((downloaded / totalSize) * 100).toFixed(2);
                process.stdout.write(`\rDownloading: ${percent}% (${downloaded}/${totalSize} bytes)`);
            } else {
                process.stdout.write(`\rDownloading: ${downloaded} bytes`);
            }
        });
        response.data.on('end', () => {
            process.stdout.write('\n');
        });
        response.data.pipe(writer);
        await finishedDownload(writer);
    }

    private checkStorageDir() {
        const storageDir = './storage';
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir);
        }
    }
}