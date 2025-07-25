import React, { useState, useEffect } from 'react';
import { Globe, Download, ChevronDown } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface VideoInputProps {
  onSubmit: (url: string, format: string) => void;
  isProcessing: boolean;
  onVideoImported?: () => void;
}

const VideoInput: React.FC<VideoInputProps> = ({ onSubmit, isProcessing, onVideoImported }) => {
  const { t } = useLanguage();
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('');
  const [showFormats, setShowFormats] = useState(false);
  const [isValidUrl, setIsValidUrl] = useState(false);
  const [formats, setFormats] = useState<Array<{ value: string; label: string; size: string }>>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const validateUrl = (urlString: string) => {
    try {
      // Only check if the string is a valid URL
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  };

  const analyzeVideoPage = async (videoUrl: string) => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setFormats([]);
    setFormat('');
    
    try {
      const response = await fetch('http://localhost:6800/videopage_analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: videoUrl }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to analyze video: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.videos && data.videos.length > 0) {
         const video = data.videos[0]; // Use the first video found
         // Helper function to detect if format has audio
         const hasAudio = (fmt: any) => {
           // Check if audio bitrate exists and is not 0
           if (fmt.abr && fmt.abr > 0) return true;
           // Check if audio codec exists and is not 'none'
           if (fmt.acodec && fmt.acodec !== 'none') return true;
           // For combined formats, abr might be null but vbr is also null (indicating combined stream)
           if (fmt.abr === null && fmt.vbr === null) return true;
           return false;
         };
         
         // Get all MP4 formats
         const allMp4Formats = video.formats
           .filter((fmt: any) => fmt.ext && fmt.ext.toLowerCase() === 'mp4');
         
         // Group formats by quality and keep only the largest filesize for each quality
         const formatsByQuality = new Map<string, any>();
         
         allMp4Formats.forEach((fmt: any) => {
           const quality = fmt.quality || 'Unknown';
           const existing = formatsByQuality.get(quality);
           
           if (!existing || (fmt.filesize || 0) > (existing.filesize || 0)) {
             formatsByQuality.set(quality, fmt);
           }
         });
         
         // Convert to array and sort by resolution order
         const filteredFormats = Array.from(formatsByQuality.values())
           .sort((a: any, b: any) => {
             // Define resolution order
             const resolutionOrder = ['360p', '480p', '720p', '1080p', '1440p', '2160p', '4K'];
             
             const aQuality = a.quality || 'Unknown';
             const bQuality = b.quality || 'Unknown';
             
             const aIndex = resolutionOrder.indexOf(aQuality);
             const bIndex = resolutionOrder.indexOf(bQuality);
             
             // If both are in the order list, sort by index (reversed for descending order)
             if (aIndex !== -1 && bIndex !== -1) {
               return bIndex - aIndex;
             }
             
             // If only one is in the order list, prioritize it
             if (aIndex !== -1) return -1;
             if (bIndex !== -1) return 1;
             
             // If neither is in the order list, sort alphabetically
             return aQuality.localeCompare(bQuality);
           });
         
         const availableFormats = filteredFormats.map((fmt: any) => ({
           value: fmt.format_id,
           label: `${fmt.quality || 'Unknown'} (${fmt.ext.toUpperCase()})`,
           size: fmt.filesize ? `${(fmt.filesize / (1024 * 1024)).toFixed(1)} MB` : 'Unknown size'
         }));
         
         setFormats(availableFormats);
         if (availableFormats.length > 0) {
           setFormat(availableFormats[0].value); // Set default to first available format
         } else {
           setAnalyzeError('No MP4 formats available for this URL');
         }
       } else {
         setAnalyzeError('No video formats found for this URL');
       }
    } catch (error) {
      setAnalyzeError(error instanceof Error ? error.message : 'Failed to analyze video');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    const isValid = validateUrl(newUrl);
    setIsValidUrl(isValid);
    
    if (!isValid) {
      setShowFormats(false);
      setFormats([]);
      setFormat('');
      setAnalyzeError(null);
    }
  };

  // Analyze video when URL becomes valid
  useEffect(() => {
    if (isValidUrl && url.trim()) {
      analyzeVideoPage(url.trim());
    }
  }, [isValidUrl, url]);

  const hintPlaceholders = [
    'e.g. https://youtube.com/...',
    'e.g. https://bilibili.com/...',
    'e.g. https://x.com/...',
  ];
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % hintPlaceholders.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim() && isValidUrl && format) {
      setIsImporting(true);
      
      try {
        // Step 1: Download the video
        const downloadResponse = await fetch('http://localhost:6800/videopage_download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: url.trim(),
            format_id: format
          })
        });
        
        if (!downloadResponse.ok) {
          throw new Error(`Download failed: ${downloadResponse.statusText}`);
        }
        
        const downloadData = await downloadResponse.json();
        
        // Step 2: Save the video to library
        const saveResponse = await fetch('http://localhost:6800/videopage_save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            video_url: url.trim(),
            video_file_name: downloadData.filename
          })
        });
        
        if (!saveResponse.ok) {
          throw new Error(`Save failed: ${saveResponse.statusText}`);
        }
        
        const saveData = await saveResponse.json();
        
        // Clear the form after successful import
        setUrl('');
        setFormat('');
        setFormats([]);
        setIsValidUrl(false);
        setShowFormats(false);
        setAnalyzeError(null);
        
        // Trigger video library refresh
        if (onVideoImported) {
          onVideoImported();
        }
        
        // Call the original onSubmit callback with success
        onSubmit(url.trim(), format);
        
      } catch (error) {
        console.error('Import failed:', error);
        // You might want to show an error message to the user here
        alert(error instanceof Error ? error.message : 'Failed to import video');
      } finally {
        setIsImporting(false);
      }
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 shadow-2xl border border-slate-700/50">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">{t('videoInput.title')}</h2>
        <p className="text-slate-400">{t('videoInput.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-slate-300 mb-2">
            {t('videoInput.urlLabel')}
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="url"
              id="url"
              value={url}
              onChange={handleUrlChange}
              placeholder={hintPlaceholders[placeholderIndex]}
              className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              disabled={isImporting}
              required
            />
            {url && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                {isValidUrl ? (
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                ) : (
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                )}
              </div>
            )}
          </div>
          {url && !isValidUrl && (
            <p className="text-red-400 text-sm mt-2">
              {t('videoInput.invalidUrl')}
            </p>
          )}
        </div>

        {isValidUrl && (
        <div className="animate-in slide-in-from-top-2 duration-300">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            {t('videoInput.qualityLabel')}
          </label>
          
          {isAnalyzing ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-slate-400">{t('videoInput.analyzing')}</span>
            </div>
          ) : analyzeError ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-red-400 text-sm">{analyzeError}</p>
            </div>
          ) : formats.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFormats(!showFormats)}
                disabled={isImporting}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white hover:bg-slate-700/70 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{formats.find(f => f.value === format)?.label || t('videoInput.selectFormat')}</span>
                <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${showFormats ? 'rotate-180' : ''}`} />
              </button>
              
              {showFormats && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                  {formats.map((formatOption) => (
                    <button
                      key={formatOption.value}
                      type="button"
                      onClick={() => {
                        setFormat(formatOption.value);
                        setShowFormats(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-slate-700/50 first:rounded-t-lg last:rounded-b-lg transition-colors duration-150"
                    >
                      <div className="text-white">{formatOption.label}</div>
                      <div className="text-slate-400 text-sm">{formatOption.size}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-yellow-400 text-sm">{t('videoInput.noFormats')}</p>
            </div>
          )}
        </div>
        )}

        <button
          type="submit"
          disabled={isProcessing || isImporting || !url.trim() || !isValidUrl || !format || isAnalyzing || formats.length === 0 || analyzeError !== null}
          className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
        >
          {isProcessing || isImporting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>{t('videoInput.processing')}</span>
            </>
          ) : (
            <>
              <Download className="h-5 w-5" />
              <span>{t('videoInput.importVideo')}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default VideoInput;