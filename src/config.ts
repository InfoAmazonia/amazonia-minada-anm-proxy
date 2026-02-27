import dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
    appPort: process.env.APP_PORT || 3000,
    syncInterval: parseInt(process.env.SYNC_INTERVAL || '86400000', 10), // Default 1 day
    urls: {
        ANM : {
            PROCESSOSMINERARIOS_SHAPEFILEURL: process.env.ANM_PROCESSOSMINERARIOS_SHAPEFILEURL ,
            PROCESSOSMINERARIOS_SHAPEFILE_NAME: process.env.ANM_PROCESSOSMINERARIOS_SHAPEFILE_NAME 
        }
    }
};