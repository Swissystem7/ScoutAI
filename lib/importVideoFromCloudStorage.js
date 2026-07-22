function importVideoFromCloudStorage(provider, authToken, fileId, options = {}) {
    const maxSizeMB = options.maxSizeMB === undefined ? 500 : options.maxSizeMB;
    if (!Number.isFinite(maxSizeMB) || maxSizeMB <= 0) {
        return Promise.resolve({ success: false, localPath: '', videoMetadata: { name: '', sizeBytes: 0, mimeType: '' }, error: 'FILE_TOO_LARGE' });
    }
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const supportedMimeTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/ogg', 'video/3gpp', 'video/mpeg'];
    const tempDir = process.env.FACTORY_TEMP_DIR || 'D:\\claude-node\\tmp';
    const path = require('path');
    const fs = require('fs');
    const https = require('https');
    const http = require('http');
    const { spawn } = require('child_process');

    const providerConfigs = {
        google_drive: {
            baseUrl: 'https://www.googleapis.com/drive/v3/files',
            downloadUrl: (fileId) => `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
            metadataUrl: (fileId) => `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,size,mimeType`,
            headers: (token) => ({ 'Authorization': `Bearer ${token}` })
        },
        dropbox: {
            baseUrl: 'https://api.dropboxapi.com/2/files',
            downloadUrl: (fileId) => `https://content.dropboxapi.com/2/files/download`,
            metadataUrl: (fileId) => `https://api.dropboxapi.com/2/files/get_metadata`,
            headers: (token) => ({ 'Authorization': `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: fileId }) })
        },
        hudl: {
            baseUrl: 'https://api.hudl.com/v1',
            downloadUrl: (fileId) => `https://api.hudl.com/v1/media/${fileId}/download`,
            metadataUrl: (fileId) => `https://api.hudl.com/v1/media/${fileId}`,
            headers: (token) => ({ 'Authorization': `Bearer ${token}` })
        }
    };

    function makeRequest(url, headers, method = 'GET') {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const mod = urlObj.protocol === 'https:' ? https : http;
            const req = mod.request(url, { method, headers }, (res) => {
                let data = [];
                res.on('data', chunk => data.push(chunk));
                res.on('end', () => {
                    const body = Buffer.concat(data);
                    resolve({ statusCode: res.statusCode, headers: res.headers, body });
                });
            });
            req.on('error', (err) => reject(err));
            req.end();
        });
    }

    function makeStreamRequest(url, headers, destPath) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const mod = urlObj.protocol === 'https:' ? https : http;
            const fileStream = fs.createWriteStream(destPath);
            const req = mod.request(url, { method: 'GET', headers }, (res) => {
                if (res.statusCode >= 400) {
                    fileStream.close();
                    fs.unlinkSync(destPath);
                    resolve({ statusCode: res.statusCode, headers: res.headers, body: null });
                    return;
                }
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve({ statusCode: res.statusCode, headers: res.headers, body: null });
                });
            });
            req.on('error', (err) => {
                fileStream.close();
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                reject(err);
            });
            req.end();
        });
    }

    function getDuration(filePath) {
        return new Promise((resolve) => {
            const ffprobe = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
            let output = '';
            ffprobe.stdout.on('data', (data) => output += data.toString());
            ffprobe.on('close', (code) => {
                if (code === 0 && output.trim()) {
                    resolve(parseFloat(output.trim()));
                } else {
                    resolve(undefined);
                }
            });
            ffprobe.on('error', () => resolve(undefined));
        });
    }

    return (async () => {
        try {
            const config = providerConfigs[provider];
            if (!config) {
                return { success: false, localPath: '', videoMetadata: { name: '', sizeBytes: 0, mimeType: '' }, error: 'UNSUPPORTED_PROVIDER' };
            }

            let metadataResponse;
            if (provider === 'dropbox') {
                const metaHeaders = { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' };
                const metaBody = JSON.stringify({ path: fileId });
                const urlObj = new URL(config.metadataUrl(fileId));
                const mod = urlObj.protocol === 'https:' ? https : http;
                metadataResponse = await new Promise((resolve, reject) => {
                    const req = mod.request(config.metadataUrl(fileId), { method: 'POST', headers: metaHeaders }, (res) => {
                        let data = [];
                        res.on('data', chunk => data.push(chunk));
                        res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(data) }));
                    });
                    req.on('error', reject);
                    req.write(metaBody);
                    req.end();
                });
            } else {
                metadataResponse = await makeRequest(config.metadataUrl(fileId), config.headers(authToken));
            }

            if (metadataResponse.statusCode === 401 || metadataResponse.statusCode === 403) {
                return { success: false, localPath: '', videoMetadata: { name: '', sizeBytes: 0, mimeType: '' }, error: 'TOKEN_EXPIRED' };
            }
            if (metadataResponse.statusCode === 404) {
                return { success: false, localPath: '', videoMetadata: { name: '', sizeBytes: 0, mimeType: '' }, error: 'FILE_NOT_FOUND' };
            }
            if (metadataResponse.statusCode >= 400) {
                return { success: false, localPath: '', videoMetadata: { name: '', sizeBytes: 0, mimeType: '' }, error: 'DOWNLOAD_FAILED' };
            }

            let metadata;
            try {
                metadata = JSON.parse(metadataResponse.body.toString());
            } catch {
                return { success: false, localPath: '', videoMetadata: { name: '', sizeBytes: 0, mimeType: '' }, error: 'DOWNLOAD_FAILED' };
            }

            let fileName, fileSize, mimeType;
            if (provider === 'google_drive') {
                fileName = metadata.name;
                fileSize = parseInt(metadata.size) || 0;
                mimeType = metadata.mimeType;
            } else if (provider === 'dropbox') {
                fileName = metadata.name;
                fileSize = metadata.size || 0;
                mimeType = metadata.mimeType || 'video/mp4';
            } else if (provider === 'hudl') {
                fileName = metadata.name || metadata.fileName || 'video.mp4';
                fileSize = metadata.size || metadata.fileSize || 0;
                mimeType = metadata.mimeType || metadata.contentType || 'video/mp4';
            }

            if (!supportedMimeTypes.includes(mimeType)) {
                return { success: false, localPath: '', videoMetadata: { name: fileName, sizeBytes: fileSize, mimeType }, error: 'UNSUPPORTED_FORMAT' };
            }

            if (fileSize > maxSizeBytes) {
                return { success: false, localPath: '', videoMetadata: { name: fileName, sizeBytes: fileSize, mimeType }, error: 'FILE_TOO_LARGE' };
            }

            const ext = path.extname(fileName) || '.mp4';
            fs.mkdirSync(tempDir, { recursive: true });
            const localPath = path.join(tempDir, `scoutai_${require('crypto').randomUUID()}${ext}`);

            let downloadResponse;
            if (provider === 'dropbox') {
                const dlHeaders = { 'Authorization': `Bearer ${authToken}`, 'Dropbox-API-Arg': JSON.stringify({ path: fileId }) };
                downloadResponse = await makeStreamRequest(config.downloadUrl(fileId), dlHeaders, localPath);
            } else {
                downloadResponse = await makeStreamRequest(config.downloadUrl(fileId), config.headers(authToken), localPath);
            }

            if (downloadResponse.statusCode === 401 || downloadResponse.statusCode === 403) {
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                return { success: false, localPath: '', videoMetadata: { name: fileName, sizeBytes: fileSize, mimeType }, error: 'TOKEN_EXPIRED' };
            }
            if (downloadResponse.statusCode === 404) {
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                return { success: false, localPath: '', videoMetadata: { name: fileName, sizeBytes: fileSize, mimeType }, error: 'FILE_NOT_FOUND' };
            }
            if (downloadResponse.statusCode >= 400) {
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                return { success: false, localPath: '', videoMetadata: { name: fileName, sizeBytes: fileSize, mimeType }, error: 'DOWNLOAD_FAILED' };
            }

            const duration = await getDuration(localPath);

            return {
                success: true,
                localPath,
                videoMetadata: {
                    name: fileName,
                    sizeBytes: fileSize,
                    durationSec: duration,
                    mimeType
                }
            };
        } catch (err) {
            return { success: false, localPath: '', videoMetadata: { name: '', sizeBytes: 0, mimeType: '' }, error: 'DOWNLOAD_FAILED' };
        }
    })();
}

module.exports = { importVideoFromCloudStorage };
