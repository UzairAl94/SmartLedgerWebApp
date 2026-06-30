import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const RECEIPTS_DIR = 'receipts';
const isWeb = () => Capacitor.getPlatform() === 'web';

// readFile may return a base64 string (native) or a Blob (web) depending on platform.
const toBase64 = async (data: string | Blob): Promise<string> => {
    if (typeof data === 'string') return data;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(data);
    });
};

export const receiptService = {
    /** Capture from camera or gallery, compress, save to disk. Returns the relative path. */
    async capture(): Promise<string | null> {
        const photo = await Camera.getPhoto({
            quality: 60,
            width: 1280,
            allowEditing: false,
            resultType: CameraResultType.Base64,
            source: CameraSource.Prompt,
        });
        if (!photo.base64String) return null;

        const path = `${RECEIPTS_DIR}/${crypto.randomUUID()}.jpg`;
        await Filesystem.writeFile({
            path,
            data: photo.base64String,
            directory: Directory.Data,
            recursive: true,
        });
        return path;
    },

    /** A data URL usable as <img src>. */
    async displaySrc(path: string): Promise<string> {
        const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
        return `data:image/jpeg;base64,${await toBase64(data)}`;
    },

    /** Save/share the receipt out of the app. */
    async download(path: string): Promise<void> {
        const base64 = await receiptService.readBase64(path);
        const fileName = path.split('/').pop() || 'receipt.jpg';

        if (isWeb()) {
            const a = document.createElement('a');
            a.href = `data:image/jpeg;base64,${base64}`;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return;
        }

        // Native: stage a copy in Cache and hand to the share sheet.
        const cachePath = `Receipt_${fileName}`;
        await Filesystem.writeFile({ path: cachePath, data: base64, directory: Directory.Cache });
        const { uri } = await Filesystem.getUri({ path: cachePath, directory: Directory.Cache });
        await Share.share({ title: 'Receipt', url: uri, dialogTitle: 'Save receipt' });
    },

    async remove(path?: string): Promise<void> {
        if (!path) return;
        try {
            await Filesystem.deleteFile({ path, directory: Directory.Data });
        } catch {
            // already gone
        }
    },

    async readBase64(path: string): Promise<string> {
        const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
        return toBase64(data);
    },

    async writeBase64(path: string, base64: string): Promise<void> {
        await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true });
    },

    /** Wipe all stored receipts (used before a backup restore). */
    async clearAll(): Promise<void> {
        try {
            await Filesystem.rmdir({ path: RECEIPTS_DIR, directory: Directory.Data, recursive: true });
        } catch {
            // dir may not exist yet
        }
    },
};
