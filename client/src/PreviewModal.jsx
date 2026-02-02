import React, { useState, useEffect } from 'react';
import { FileService } from './services/FileSystemService';
import { XMarkIcon, ArrowDownTrayIcon, DocumentIcon } from '@heroicons/react/24/outline';

const PreviewModal = ({ file, onClose, drive = 'local', lang = 'en' }) => {
  const [content, setContent] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeDriveConfig, setActiveDriveConfig] = useState(null);

  const fileType = file.type || '';
  const isImage = fileType.startsWith('image/');
  const isVideo = fileType.startsWith('video/');
  const isAudio = fileType.startsWith('audio/');
  const isPDF = fileType === 'application/pdf';
  const isText = fileType.startsWith('text/') || 
                 /\.(json|js|jsx|ts|tsx|py|md|css|html|xml|yml|yaml|ini|conf|sh|bash|zsh)$/i.test(file.name);

  // Load drive config
  useEffect(() => {
     FileService.getDrives().then(drives => {
         const config = drives.find(d => d.id === drive);
         setActiveDriveConfig(config);
     });
  }, [drive]);

  // Load Content
  useEffect(() => {
    if (!activeDriveConfig) return;

    const loadContent = async () => {
        setLoading(true);
        try {
            if (isText) {
                // Read as text
                const data = await FileService.readFile(file.path, activeDriveConfig);
                
                if (activeDriveConfig.type === 'local' && typeof data === 'string') {
                    // Capacitor returns Base64 by default if no encoding
                    try {
                        setContent(atob(data));
                    } catch (e) {
                        setContent(data); // Fallback
                    }
                } else if (typeof data !== 'string') {
                    // Assuming buffer (WebDAV)
                    const text = new TextDecoder().decode(data);
                    setContent(text);
                } else {
                    setContent(data);
                }
            } else if (isImage || isVideo || isAudio || isPDF) {
                // Get Blob/URL
                if (activeDriveConfig.type === 'local') {
                    const url = await FileService.getFileUrl(file.path, activeDriveConfig);
                    setFileUrl(url);
                } else {
                    // WebDAV: Fetch blob and create object URL
                    const buffer = await FileService.readFile(file.path, activeDriveConfig);
                    const blob = new Blob([buffer], { type: fileType });
                    const url = URL.createObjectURL(blob);
                    setFileUrl(url);
                }
            }
        } catch (e) {
            console.error(e);
            setContent('Error loading preview');
        } finally {
            setLoading(false);
        }
    };

    loadContent();
    
    // Cleanup Object URL
    return () => {
        if (fileUrl && fileUrl.startsWith('blob:')) {
            URL.revokeObjectURL(fileUrl);
        }
    };
  }, [file.path, activeDriveConfig, isText, isImage, isVideo, isAudio, isPDF]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={onClose}>
      
      {/* Close Button */}
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-50"
      >
        <XMarkIcon className="w-6 h-6" />
      </button>

      {/* Main Content Area */}
      <div 
        className="relative max-w-5xl max-h-[90vh] w-full flex flex-col items-center justify-center"
        onClick={e => e.stopPropagation()} // Prevent closing when clicking content
      >
        
        {loading && <div className="text-white">Loading...</div>}

        {/* Preview Renderers */}
        {!loading && isImage && fileUrl && (
          <img src={fileUrl} alt={file.name} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
        )}

        {!loading && isVideo && fileUrl && (
          <video src={fileUrl} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg shadow-2xl bg-black" />
        )}

        {!loading && isAudio && fileUrl && (
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 min-w-[300px]">
            <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mb-2">
              <DocumentIcon className="w-12 h-12 text-indigo-500" />
            </div>
            <h3 className="font-medium text-slate-800 text-center truncate w-full px-2">{file.name}</h3>
            <audio src={fileUrl} controls className="w-full" autoPlay />
          </div>
        )}

        {!loading && isPDF && fileUrl && (
          <iframe src={fileUrl} className="w-full h-[85vh] bg-white rounded-lg shadow-2xl" title="PDF Preview" />
        )}

        {!loading && isText && (
          <div className="w-full h-[85vh] bg-white rounded-lg shadow-2xl overflow-auto p-4 font-mono text-sm text-slate-700 whitespace-pre-wrap">
            {content}
          </div>
        )}

        {/* Fallback for unsupported types or error */}
        {!loading && !isImage && !isVideo && !isAudio && !isPDF && !isText && (
          <div className="bg-white p-10 rounded-2xl shadow-2xl flex flex-col items-center gap-6">
            <DocumentIcon className="w-20 h-20 text-slate-300" />
            <div className="text-center">
              <p className="text-lg font-medium text-slate-700">No Preview Available</p>
              <p className="text-sm text-slate-400 mt-1">{file.name}</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default PreviewModal;