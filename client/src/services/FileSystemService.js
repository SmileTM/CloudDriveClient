import { createClient } from 'webdav';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY_DRIVES = 'cloud_mgr_drives';

// Helper: Normalize file info to match existing UI
const normalizeWebDAVFile = (item) => ({
    name: item.basename,
    path: item.filename,
    isDirectory: item.type === 'directory',
    size: item.size || 0,
    mtime: item.lastmod,
    type: item.type === 'directory' ? 'folder' : (item.mime || 'application/octet-stream')
});

const normalizeLocalFile = (file, parentPath) => {
    // Capacitor Filesystem returns partial info
    return {
        name: file.name,
        path: parentPath === '/' ? `/${file.name}` : `${parentPath}/${file.name}`,
        isDirectory: file.type === 'directory',
        size: file.size || 0,
        mtime: file.mtime || Date.now(),
        type: file.type === 'directory' ? 'folder' : 'application/octet-stream'
    };
};

// Helper to create WebDAV client with proxy support
const createWebDAVClient = (drive) => {
    let url = drive.url;
    // Proxy for Jianguoyun on Web/Vercel to avoid CORS
    if (!Capacitor.isNativePlatform() && url.includes('dav.jianguoyun.com')) {
        url = '/jianguoyun-proxy/';
    }
    return createClient(url, {
        username: drive.username,
        password: drive.password
    });
};

export const FileService = {
    // --- Drive Configuration (Local Only) ---
    async getDrives() {
        // 1. Always have Local Storage (App Sandbox or Browser Memory)
        const defaultLocal = { id: 'local', name: 'Local Device', type: 'local', path: '/' };
        
        // 2. Load Saved WebDAV Drives from Secure Storage
        const { value } = await Preferences.get({ key: STORAGE_KEY_DRIVES });
        const savedDrives = value ? JSON.parse(value) : [];
        
        return [defaultLocal, ...savedDrives];
    },

    async addDrive(driveConfig) {
        const drives = await this.getDrives();
        // Remove 'local' from list before saving (it's always dynamic)
        const newDrives = [...drives.filter(d => d.id !== 'local'), driveConfig];
        await Preferences.set({
            key: STORAGE_KEY_DRIVES,
            value: JSON.stringify(newDrives)
        });
        return newDrives; // Return full list for UI
    },

    async removeDrive(driveId) {
        const drives = await this.getDrives();
        const newDrives = drives.filter(d => d.id !== driveId && d.id !== 'local');
        await Preferences.set({
            key: STORAGE_KEY_DRIVES,
            value: JSON.stringify(newDrives)
        });
    },
    
    async updateDrive(driveId, updates) {
        const drives = await this.getDrives();
        const index = drives.findIndex(d => d.id === driveId);
        if (index !== -1 && drives[index].id !== 'local') {
            drives[index] = { ...drives[index], ...updates };
            // Save only non-local drives
            const savedDrives = drives.filter(d => d.id !== 'local');
            await Preferences.set({
                key: STORAGE_KEY_DRIVES,
                value: JSON.stringify(savedDrives)
            });
        }
    },
    
    // --- File Operations ---
    
    // List Files
    async listFiles(path, drive) {
        if (drive.type === 'local') {
             // Capacitor Filesystem (App) or Mock (Browser)
             if (Capacitor.isNativePlatform()) {
                 try {
                    const result = await Filesystem.readdir({
                        path: path,
                        directory: Directory.Documents // Sandbox limit
                    });
                    return result.files.map(f => normalizeLocalFile(f, path));
                 } catch (e) {
                    console.error('FS Read Error', e);
                    return [];
                 }
             } else {
                 // Browser Fallback (Empty or Mock)
                 console.warn('Local file system not available in browser. Use App.');
                 return [];
             }
        } else if (drive.type === 'webdav') {
            const client = createWebDAVClient(drive);
            const items = await client.getDirectoryContents(path);
            return items.map(normalizeWebDAVFile);
        }
        return [];
    },

    // Create Directory
    async createDirectory(path, drive) {
        if (drive.type === 'local') {
            if (Capacitor.isNativePlatform()) {
                await Filesystem.mkdir({
                    path: path,
                    directory: Directory.Documents,
                    recursive: true
                });
            }
        } else {
            const client = createWebDAVClient(drive);
            await client.createDirectory(path);
        }
    },

    // Delete
    async delete(items, drive) {
         if (drive.type === 'local') {
            if (Capacitor.isNativePlatform()) {
                await Promise.all(items.map(path => Filesystem.deleteFile({
                    path: path,
                    directory: Directory.Documents
                })));
            }
        } else {
            const client = createWebDAVClient(drive);
            await Promise.all(items.map(itemPath => client.deleteFile(itemPath)));
        }
    },

    // Rename (Same Dir)
    async rename(oldPath, newName, drive) {
         const parent = oldPath.split('/').slice(0, -1).join('/') || '/';
         const newPath = parent === '/' ? `/${newName}` : `${parent}/${newName}`;
         
         if (drive.type === 'local') {
            if (Capacitor.isNativePlatform()) {
                await Filesystem.rename({ from: oldPath, to: newPath, directory: Directory.Documents });
            }
        } else {
            const client = createWebDAVClient(drive);
            await client.moveFile(oldPath, newPath);
        }
    },

    // Move (Different Dir)
    async move(items, destination, drive) {
        if (drive.type === 'local') {
            if (Capacitor.isNativePlatform()) {
                await Promise.all(items.map(item => {
                    const name = item.split('/').pop();
                    const newPath = destination === '/' ? `/${name}` : `${destination}/${name}`;
                    return Filesystem.rename({ from: item, to: newPath, directory: Directory.Documents });
                }));
            }
        } else {
            const client = createWebDAVClient(drive);
            await Promise.all(items.map(item => {
                 const name = item.split('/').pop();
                 const destPath = destination.replace(/\/+$/, '') + '/' + name;
                 return client.moveFile(item, destPath);
            }));
        }
    },
    
    // Get File URL (for Preview)
    async getFileUrl(path, drive) {
        if (drive.type === 'local') {
             if (Capacitor.isNativePlatform()) {
                 const uri = await Filesystem.getUri({
                     path: path,
                     directory: Directory.Documents
                 });
                 return Capacitor.convertFileSrc(uri.uri);
             }
             return '';
        } else {
            // For WebDAV, we might need a signed URL or proxy. 
            // For now, return direct link with auth embedded is risky, 
            // better to use the client.getFileContents to BlobUrl if possible.
            // Simplified: return nothing, PreviewModal will need to fetch blob.
            return null;
        }
    },

    // Read File (for Preview/Download)
    async readFile(path, drive) {
        if (drive.type === 'local') {
            if (Capacitor.isNativePlatform()) {
                const contents = await Filesystem.readFile({
                    path: path,
                    directory: Directory.Documents,
                    // encoding: Encoding.UTF8 // Binary?
                });
                return contents.data;
            }
        } else {
            const client = createWebDAVClient(drive);
            const buff = await client.getFileContents(path);
            return buff;
        }
    },

    // Upload File
    async uploadFile(path, fileObj, drive) {
         if (drive.type === 'local') {
             if (Capacitor.isNativePlatform()) {
                 // Convert File/Blob to Base64
                 const toBase64 = file => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = error => reject(error);
                 });
                 
                 const data = await toBase64(fileObj);
                 await Filesystem.writeFile({
                     path: path,
                     data: data,
                     directory: Directory.Documents
                 });
             }
        } else {
            const client = createWebDAVClient(drive);
            // webdav client accepts ArrayBuffer or String
            const arrayBuffer = await fileObj.arrayBuffer();
            await client.putFileContents(path, arrayBuffer);
        }
    }
};