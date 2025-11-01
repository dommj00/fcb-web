import React, { useState, useRef } from 'react';
import { trimClip, exportClip } from './api';

function ClipEditorModal({ clip, onClose }) {
  // State management
  const [videoSrc, setVideoSrc] = useState(clip?.download_url || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  
  // Trim state - now using seconds instead of time strings
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(null); // Will be set to duration on load
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  
  // History for undo/redo
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Text overlay state
  const [textOverlay, setTextOverlay] = useState('');
  const [textOverlays, setTextOverlays] = useState([]);
  
  // Music state
  const [selectedMusic, setSelectedMusic] = useState('No music');
  const [uploadedMusic, setUploadedMusic] = useState(null);

  // Text overlay state
  const [textInput, setTextInput] = useState('');
  const [textList, setTextList] = useState([]);
  const [selectedFont, setSelectedFont] = useState('Inter');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textSize, setTextSize] = useState(24);
  const [backgroundColor, setBackgroundColor] = useState('transparent');
  const [backgroundOpacity, setBackgroundOpacity] = useState(0);
  const [textOutline, setTextOutline] = useState(false);
  const [outlineColor, setOutlineColor] = useState('#000000');
  const [textShadow, setTextShadow] = useState(false);
  const [textAlign, setTextAlign] = useState('center');
  
  // Export state
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [letterboxMode, setLetterboxMode] = useState(true);
  
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const thumbnailCanvasRef = useRef(null);
  
  // Thumbnail state
  const [thumbnails, setThumbnails] = useState([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);

  // Video player controls
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        // If current time is outside trim range, start from trim start
        if (videoRef.current.currentTime < trimStart || videoRef.current.currentTime >= trimEnd) {
          videoRef.current.currentTime = trimStart;
        }
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      
      // Loop within trim range if playing
      if (isPlaying && time >= trimEnd) {
        videoRef.current.currentTime = trimStart;
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);
      setTrimEnd(videoDuration);
      
      // Initialize history with the full video
      setHistory([{ start: 0, end: videoDuration, videoSrc: videoSrc }]);
      setHistoryIndex(0);
      
      // Generate thumbnails
      generateThumbnails();
    }
  };

  // Generate thumbnails for the filmstrip
  const generateThumbnails = async () => {
    if (!videoRef.current || !duration) return;
    
    setIsGeneratingThumbnails(true);
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size for thumbnails
    canvas.width = 160;
    canvas.height = 90;
    
    const thumbnailCount = 20; // Number of thumbnails to generate
    const interval = duration / thumbnailCount;
    const newThumbnails = [];
    
    try {
      for (let i = 0; i < thumbnailCount; i++) {
        const time = i * interval;
        
        // Seek to the time
        video.currentTime = time;
        
        // Wait for seek to complete
        await new Promise(resolve => {
          const seeked = () => {
            video.removeEventListener('seeked', seeked);
            resolve();
          };
          video.addEventListener('seeked', seeked);
        });
        
        // Draw the frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        newThumbnails.push(dataUrl);
      }
      
      setThumbnails(newThumbnails);
      
      // Reset video to start
      video.currentTime = 0;
    } catch (error) {
      console.error('Error generating thumbnails:', error);
    } finally {
      setIsGeneratingThumbnails(false);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const skipBackward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
    }
  };

  const skipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  };

  // Format time helper
  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Timeline drag handlers
  const handleTimelineMouseDown = (e, type) => {
    e.preventDefault();
    if (type === 'left') setIsDraggingLeft(true);
    else if (type === 'right') setIsDraggingRight(true);
    else if (type === 'playhead') setIsDraggingPlayhead(true);
  };

  const handleTimelineMouseMove = (e) => {
    if (!isDraggingLeft && !isDraggingRight && !isDraggingPlayhead) return;
    if (!trimEnd || !duration) return; // Safety check
    
    const timeline = e.currentTarget;
    const rect = timeline.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const time = percentage * duration;
    
    if (isDraggingLeft) {
      // Don't let left handle go past right handle (leave at least 0.5s gap)
      setTrimStart(Math.min(time, trimEnd - 0.5));
      // Update video preview
      if (videoRef.current) {
        videoRef.current.currentTime = Math.min(time, trimEnd - 0.5);
      }
    } else if (isDraggingRight) {
      // Don't let right handle go past left handle
      setTrimEnd(Math.max(time, trimStart + 0.5));
      // Update video preview
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(time, trimStart + 0.5);
      }
    } else if (isDraggingPlayhead) {
      // Constrain playhead to trim range
      const constrainedTime = Math.max(trimStart, Math.min(time, trimEnd));
      setCurrentTime(constrainedTime);
      if (videoRef.current) {
        videoRef.current.currentTime = constrainedTime;
      }
    }
  };

  const handleTimelineMouseUp = () => {
    setIsDraggingLeft(false);
    setIsDraggingRight(false);
    setIsDraggingPlayhead(false);
  };

  // Add global mouse event listeners
  React.useEffect(() => {
    if (isDraggingLeft || isDraggingRight || isDraggingPlayhead) {
      document.addEventListener('mouseup', handleTimelineMouseUp);
      return () => document.removeEventListener('mouseup', handleTimelineMouseUp);
    }
  }, [isDraggingLeft, isDraggingRight, isDraggingPlayhead]);

  // Regenerate thumbnails when video source changes
  React.useEffect(() => {
    if (videoRef.current && duration > 0) {
      // Small delay to ensure video is loaded
      const timer = setTimeout(() => {
        generateThumbnails();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [videoSrc, duration]);

  // Undo/Redo functions
  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const prevState = history[newIndex];
      setHistoryIndex(newIndex);
      setTrimStart(prevState.start);
      setTrimEnd(prevState.end);
      setVideoSrc(prevState.videoSrc);
      
      // Update video
      if (videoRef.current) {
        videoRef.current.load();
        setCurrentTime(prevState.start);
      }
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const nextState = history[newIndex];
      setHistoryIndex(newIndex);
      setTrimStart(nextState.start);
      setTrimEnd(nextState.end);
      setVideoSrc(nextState.videoSrc);
      
      // Update video
      if (videoRef.current) {
        videoRef.current.load();
        setCurrentTime(nextState.start);
      }
    }
  };

  // Apply trim (Cut button)
  const handleApplyTrim = async () => {
    try {
      // Show loading state
      const trimButton = document.querySelector('button[data-trim-button]');
      if (trimButton) {
        trimButton.disabled = true;
        trimButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cutting...';
      }

      // Convert seconds to HH:MM:SS format
      const startTimeStr = formatTime(trimStart);
      const endTimeStr = formatTime(trimEnd);

      // Call API to trim the clip
      const result = await trimClip(clip.clip_id, startTimeStr, endTimeStr);
      
      if (result.success) {
        // Update video source to show trimmed clip
        const newVideoSrc = result.download_url;
        setVideoSrc(newVideoSrc);
        
        // Update clip data
        clip.download_url = newVideoSrc;
        clip.clip_id = result.edited_clip_id;
        
        // Calculate new duration after trim
        const newDuration = trimEnd - trimStart;
        
        // Add to history (remove any future history if we're not at the end)
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push({
          start: 0,
          end: newDuration,
          videoSrc: newVideoSrc
        });
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        
        // Reset trim handles to full new duration
        setTrimStart(0);
        setTrimEnd(newDuration);
        setDuration(newDuration);
        
        // Reset video player
        if (videoRef.current) {
          videoRef.current.load();
          setCurrentTime(0);
          setIsPlaying(false);
        }
        
        // Show success message
        const successMsg = document.createElement('div');
        successMsg.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 16px 24px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
          z-index: 10000;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 12px;
        `;
        successMsg.innerHTML = `
          <i class="fas fa-check-circle"></i>
          <span>Clip cut successfully!</span>
        `;
        document.body.appendChild(successMsg);
        
        setTimeout(() => {
          successMsg.style.transition = 'opacity 0.3s';
          successMsg.style.opacity = '0';
          setTimeout(() => successMsg.remove(), 300);
        }, 3000);
        
      } else {
        alert('Failed to cut clip');
      }
    } catch (error) {
      console.error('Cut error:', error);
      alert(`Error cutting clip: ${error.response?.data?.detail || error.message}`);
    } finally {
      // Reset button state
      const trimButton = document.querySelector('button[data-trim-button]');
      if (trimButton) {
        trimButton.disabled = false;
        trimButton.innerHTML = '<i class="fas fa-cut"></i> Cut';
      }
    }
  };

  // Text overlay functions
  const handleAddText = () => {
    if (textOverlay.trim()) {
      setTextOverlays([...textOverlays, {
        id: Date.now(),
        text: textOverlay,
        position: { x: 50, y: 50 },
        font: 'Arial',
        size: 24,
        color: '#ffffff'
      }]);
      setTextOverlay('');
    }
  };

  // Music functions
  const handleMusicUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedMusic(file);
      setSelectedMusic(file.name);
      // TODO: Upload to backend
    }
  };

  const handleAddMusic = () => {
    fileInputRef.current?.click();
  };

    const handleExport = async (platform) => {
      try {
        setSelectedPlatform(platform);
        
        // Show loading notification
        const loadingMsg = document.createElement('div');
        loadingMsg.id = 'export-loading';
        loadingMsg.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
          color: white;
          padding: 16px 24px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4);
          z-index: 10000;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 12px;
        `;
        loadingMsg.innerHTML = `
          <i class="fas fa-spinner fa-spin"></i>
          <span>Exporting for ${platform}...</span>
        `;
        document.body.appendChild(loadingMsg);

        // Call API
        const result = await exportClip(clip.clip_id, platform.toLowerCase(), letterboxMode, textList);
        
        // Remove loading message
        document.getElementById('export-loading')?.remove();
        
        if (result.success) {
          // Show success with download link
          const successMsg = document.createElement('div');
          successMsg.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 20px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
            z-index: 10000;
            font-weight: 600;
            max-width: 400px;
          `;
          successMsg.innerHTML = `
            <div style="display: flex; align-items: start; gap: 12px; margin-bottom: 12px;">
              <i class="fas fa-check-circle" style="font-size: 20px;"></i>
              <div>
                <div style="font-size: 16px; margin-bottom: 4px;">Exported for ${platform}!</div>
                <div style="font-size: 12px; opacity: 0.9;">
                  ${result.config.width}x${result.config.height} â€¢ ${result.config.aspect}
                </div>
              </div>
            </div>
            <a 
              href="${result.download_url}" 
              target="_blank"
              style="
                display: block;
                background: rgba(255,255,255,0.2);
                padding: 10px;
                border-radius: 8px;
                text-align: center;
                color: white;
                text-decoration: none;
                font-size: 14px;
              "
            >
              <i class="fas fa-download"></i> Download Now
            </a>
          `;
          document.body.appendChild(successMsg);
          
          // Remove notification after 10 seconds
          setTimeout(() => {
            successMsg.style.transition = 'opacity 0.3s';
            successMsg.style.opacity = '0';
            setTimeout(() => successMsg.remove(), 300);
          }, 10000);
          
        } else {
          alert('âŒ Failed to export clip');
        }
      } catch (error) {
        console.error('Export error:', error);
        document.getElementById('export-loading')?.remove();
        alert(`âŒ Error exporting clip: ${error.response?.data?.detail || error.message}`);
      }
    };

  const handleDownload = () => {
    // TODO: Download edited clip
    alert('Downloading edited clip...');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '95vw',
          maxWidth: '1400px',
          maxHeight: '95vh',
          overflow: 'auto'
        }}
      >
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '4px' }}>Clip Editor</h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Edit and optimize your clips</p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Main Content */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px', marginTop: '24px' }}>
          {/* Left: Video Player & Timeline */}
          <div>
          {/* Video Player */}
          <div style={{
            width: '100%',
            background: '#1a1d29',
            borderRadius: '12px',
            overflow: 'hidden',
            marginBottom: '16px',
            position: 'relative'
          }}>
            {videoSrc ? (
              <>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block'
                  }}
                />
                
                 {/* Text Overlays */}
                 {textList.map((item, index) => (
                   <div
                     key={item.id}
                     draggable
                     onDragStart={(e) => {
                       e.dataTransfer.effectAllowed = 'move';
                       e.dataTransfer.setData('text/plain', index.toString());
                     }}
                     onDragEnd={(e) => {
                       const videoRect = videoRef.current.getBoundingClientRect();
                       const x = ((e.clientX - videoRect.left) / videoRect.width) * 100;
                       const y = ((e.clientY - videoRect.top) / videoRect.height) * 100;
                       
                       // Clamp values between 5% and 95% to keep text visible
                       const clampedX = Math.max(5, Math.min(95, x));
                       const clampedY = Math.max(5, Math.min(95, y));
                       
                       const newList = [...textList];
                       newList[index] = { ...item, x: clampedX, y: clampedY };
                       setTextList(newList);
                     }}
                     style={{
                       position: 'absolute',
                       top: `${item.y}%`,
                       left: `${item.x}%`,
                       transform: 'translate(-50%, -50%)',
                       fontFamily: item.font,
                       fontSize: `${item.size}px`,
                       color: item.color,
                       textAlign: item.align,
                       fontWeight: '700',
                       textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                       cursor: 'move',
                       whiteSpace: 'nowrap',
                       zIndex: 10,
                       padding: '4px 8px',
                       border: '2px dashed rgba(255,255,255,0.3)',
                       borderRadius: '4px',
                       background: 'rgba(0,0,0,0.2)'
                     }}
                   >
                     {item.text}
                   </div>
                 ))}
              </>
            ) : (
              <div style={{
                width: '100%',
                height: '500px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b'
              }}>
                <i className="fas fa-play-circle" style={{ fontSize: '64px', marginBottom: '16px' }}></i>
                <p>No video loaded</p>
              </div>
            )}
          </div>

            {/* Timeline/Scrubber */}
            {/* Timeline with Filmstrip and Trim Handles */}
            <div style={{
              background: '#2d3748',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px'
            }}>
              {/* Timeline Container */}
              <div
                onMouseMove={handleTimelineMouseMove}
                style={{
                  width: '100%',
                  height: '100px',
                  background: '#1a1d29',
                  borderRadius: '8px',
                  position: 'relative',
                  cursor: 'default',
                  overflow: 'hidden',
                  userSelect: 'none',
                  boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.3)'
                }}
              >
                {/* Filmstrip Background with actual thumbnails */}
                {thumbnails.length > 0 ? (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    position: 'absolute'
                  }}>
                    {thumbnails.map((thumb, idx) => (
                      <div
                        key={idx}
                        style={{
                          flex: 1,
                          height: '100%',
                          backgroundImage: `url(${thumb})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          borderRight: '1px solid #1a1d29'
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#2d3748'
                  }}>
                    {isGeneratingThumbnails ? (
                      <div style={{ color: '#8b5cf6', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fas fa-spinner fa-spin"></i>
                        Generating preview...
                      </div>
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        background: 'repeating-linear-gradient(90deg, #2d3748 0px, #2d3748 40px, #374151 40px, #374151 42px)',
                        opacity: 0.5
                      }}></div>
                    )}
                  </div>
                )}

                {/* Only render interactive elements if we have valid duration */}
                {duration > 0 && trimEnd && (
                  <>
                    {/* Dimmed areas (outside trim range) */}
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: `${(trimStart / duration) * 100}%`,
                      height: '100%',
                      background: 'rgba(0, 0, 0, 0.6)',
                      pointerEvents: 'none'
                    }}></div>
                    <div style={{
                      position: 'absolute',
                      left: `${(trimEnd / duration) * 100}%`,
                      top: 0,
                      width: `${((duration - trimEnd) / duration) * 100}%`,
                      height: '100%',
                      background: 'rgba(0, 0, 0, 0.6)',
                      pointerEvents: 'none'
                    }}></div>

                    {/* Trim range highlight */}
                    <div style={{
                      position: 'absolute',
                      left: `${(trimStart / duration) * 100}%`,
                      width: `${((trimEnd - trimStart) / duration) * 100}%`,
                      height: '100%',
                      border: '2px solid #8b5cf6',
                      borderRadius: '4px',
                      pointerEvents: 'none'
                    }}></div>

                    {/* Left trim handle */}
                    <div
                      onMouseDown={(e) => handleTimelineMouseDown(e, 'left')}
                      style={{
                        position: 'absolute',
                        left: `${(trimStart / duration) * 100}%`,
                        top: 0,
                        width: '16px',
                        height: '100%',
                        background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
                        cursor: 'ew-resize',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: 'translateX(-8px)',
                        borderRadius: '6px 0 0 6px',
                        zIndex: 3,
                        boxShadow: isDraggingLeft ? '0 0 12px rgba(139, 92, 246, 0.8)' : '0 2px 8px rgba(0, 0, 0, 0.3)',
                        border: '2px solid white',
                        transition: 'box-shadow 0.2s'
                      }}
                    >
                      <div style={{
                        width: '2px',
                        height: '20px',
                        background: 'white',
                        borderRadius: '1px',
                        marginBottom: '2px'
                      }}></div>
                      <div style={{
                        width: '2px',
                        height: '20px',
                        background: 'white',
                        borderRadius: '1px'
                      }}></div>
                    </div>

                    {/* Right trim handle */}
                    <div
                      onMouseDown={(e) => handleTimelineMouseDown(e, 'right')}
                      style={{
                        position: 'absolute',
                        left: `${(trimEnd / duration) * 100}%`,
                        top: 0,
                        width: '16px',
                        height: '100%',
                        background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
                        cursor: 'ew-resize',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: 'translateX(-8px)',
                        borderRadius: '0 6px 6px 0',
                        zIndex: 3,
                        boxShadow: isDraggingRight ? '0 0 12px rgba(139, 92, 246, 0.8)' : '0 2px 8px rgba(0, 0, 0, 0.3)',
                        border: '2px solid white',
                        transition: 'box-shadow 0.2s'
                      }}
                    >
                      <div style={{
                        width: '2px',
                        height: '20px',
                        background: 'white',
                        borderRadius: '1px',
                        marginBottom: '2px'
                      }}></div>
                      <div style={{
                        width: '2px',
                        height: '20px',
                        background: 'white',
                        borderRadius: '1px'
                      }}></div>
                    </div>

                    {/* Playhead */}
                    <div
                      onMouseDown={(e) => handleTimelineMouseDown(e, 'playhead')}
                      style={{
                        position: 'absolute',
                        left: `${(currentTime / duration) * 100}%`,
                        top: 0,
                        width: '4px',
                        height: '100%',
                        background: 'linear-gradient(180deg, #ffffff 0%, #f0f0f0 100%)',
                        cursor: 'ew-resize',
                        transform: 'translateX(-2px)',
                        zIndex: 4,
                        boxShadow: isDraggingPlayhead ? '0 0 12px rgba(255, 255, 255, 0.8)' : '0 0 8px rgba(255, 255, 255, 0.5)',
                        transition: 'box-shadow 0.2s'
                      }}
                    >
                      {/* Playhead top indicator */}
                      <div style={{
                        position: 'absolute',
                        top: '-12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '16px',
                        height: '16px',
                        background: 'white',
                        borderRadius: '50%',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
                        border: '2px solid #8b5cf6'
                      }}></div>
                      
                      {/* Playhead bottom indicator */}
                      <div style={{
                        position: 'absolute',
                        bottom: '-12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '16px',
                        height: '16px',
                        background: 'white',
                        borderRadius: '50%',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
                        border: '2px solid #8b5cf6'
                      }}></div>
                    </div>
                  </>
                )}
              </div>
              
              {/* Time display */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '12px',
                color: '#a0aec0',
                fontSize: '13px'
              }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <span style={{ color: '#e2e8f0', fontWeight: '600', fontSize: '14px' }}>
                    <i className="fas fa-clock" style={{ marginRight: '6px', color: '#8b5cf6' }}></i>
                    {formatTime(currentTime)}
                  </span>
                  <span style={{ color: '#64748b' }}>
                    Trim: {formatTime(trimStart)} - {formatTime(trimEnd)}
                  </span>
                </div>
                <span style={{ fontWeight: '600', color: '#10b981' }}>
                  {trimEnd ? formatTime(trimEnd - trimStart) : '--:--:--'}
                </span>
              </div>
            </div>

            {/* Playback Controls */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '12px'
            }}>
              <button
                onClick={skipBackward}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#4a5568',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px'
                }}
              >
                <i className="fas fa-backward"></i>
              </button>

              <button
                onClick={togglePlay}
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: '#8b5cf6',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)'
                }}
              >
                <i className={`fas fa-${isPlaying ? 'pause' : 'play'}`}></i>
              </button>

              <button
                onClick={skipForward}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#4a5568',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px'
                }}
              >
                <i className="fas fa-forward"></i>
              </button>

              <button
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#4a5568',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  position: 'relative'
                }}
              >
                <i className="fas fa-volume-up"></i>
              </button>
            </div>
          </div>

          {/* Right: Editor Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Trim Controls Section */}
            <div style={{
              background: '#f8fafc',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>
                <i className="fas fa-cut" style={{ marginRight: '8px', color: '#8b5cf6' }}></i>
                Timeline Editor
              </h4>
              
              {/* Instructions */}
              <div style={{
                background: '#ede9fe',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#5b21b6',
                lineHeight: '1.6'
              }}>
                <strong style={{ display: 'block', marginBottom: '6px' }}>
                  <i className="fas fa-info-circle" style={{ marginRight: '6px' }}></i>
                  How to use:
                </strong>
                • Drag <span style={{ color: '#8b5cf6', fontWeight: '700' }}>purple handles</span> to select the portion to keep<br/>
                • Drag the <span style={{ fontWeight: '700' }}>white playhead</span> to preview different moments<br/>
                • Click <span style={{ color: '#8b5cf6', fontWeight: '700' }}>Cut</span> to trim (keeps selected segment)<br/>
                • Use <span style={{ fontWeight: '700' }}>Undo/Redo</span> to revert changes
              </div>

              {/* Undo/Redo buttons */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginBottom: '12px'
              }}>
                <button
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  style={{
                    padding: '10px',
                    background: historyIndex <= 0 ? '#e2e8f0' : 'white',
                    color: historyIndex <= 0 ? '#94a3b8' : '#475569',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (historyIndex > 0) {
                      e.currentTarget.style.borderColor = '#8b5cf6';
                      e.currentTarget.style.background = '#f3f4f6';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    if (historyIndex > 0) e.currentTarget.style.background = 'white';
                  }}
                >
                  <i className="fas fa-undo"></i>
                  Undo
                </button>

                <button
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  style={{
                    padding: '10px',
                    background: historyIndex >= history.length - 1 ? '#e2e8f0' : 'white',
                    color: historyIndex >= history.length - 1 ? '#94a3b8' : '#475569',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: historyIndex >= history.length - 1 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (historyIndex < history.length - 1) {
                      e.currentTarget.style.borderColor = '#8b5cf6';
                      e.currentTarget.style.background = '#f3f4f6';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    if (historyIndex < history.length - 1) e.currentTarget.style.background = 'white';
                  }}
                >
                  <i className="fas fa-redo"></i>
                  Redo
                </button>
              </div>

              {/* Cut button */}
              <button
                data-trim-button
                onClick={handleApplyTrim}
                disabled={trimEnd - trimStart < 0.5}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: trimEnd - trimStart < 0.5 ? '#cbd5e1' : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '700',
                  cursor: trimEnd - trimStart < 0.5 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  boxShadow: trimEnd - trimStart < 0.5 ? 'none' : '0 4px 12px rgba(139, 92, 246, 0.4)',
                  transition: 'all 0.2s'
                }}
              >
                <i className="fas fa-cut"></i>
                Cut ({formatTime(trimEnd - trimStart)})
              </button>

              {/* History indicator */}
              {history.length > 1 && (
                <div style={{
                  marginTop: '12px',
                  padding: '8px 12px',
                  background: 'white',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <i className="fas fa-history"></i>
                  <span>{history.length - 1} edit(s) made</span>
                </div>
              )}
            </div>

            {/* Text Overlay Section */}
            <div style={{
              background: '#f8fafc',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>Text Overlay</h4>
              
              <input
                type="text"
                value={textOverlay}
                onChange={(e) => setTextOverlay(e.target.value)}
                placeholder="Enter text..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  marginBottom: '12px'
                }}
              />

              <button
                onClick={handleAddText}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <i className="fas fa-font"></i>
                Add Text
              </button>

              {textOverlays.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                    {textOverlays.length} text overlay(s) added
                  </p>
                </div>
              )}
            </div>

            {/* Background Music Section */}
            <div style={{
              background: '#f8fafc',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>Background Music</h4>
              
              <select
                value={selectedMusic}
                onChange={(e) => setSelectedMusic(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  marginBottom: '12px',
                  cursor: 'pointer'
                }}
              >
                <option value="No music">No music</option>
                {uploadedMusic && <option value={uploadedMusic.name}>{uploadedMusic.name}</option>}
              </select>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleMusicUpload}
                style={{ display: 'none' }}
              />

              <button
                onClick={handleAddMusic}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <i className="fas fa-music"></i>
                Add Music
              </button>
            </div>
          
          {/* Text Overlay Section */}
          <div style={{
            background: '#f8fafc',
            borderRadius: '12px',
            padding: '16px'
          }}>
            <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>Text Overlay</h4>
            
            {/* Text Input */}
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter text..."
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '2px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '14px',
                marginBottom: '12px'
              }}
            />

            {/* Font Selector */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#64748b' }}>
                Font
              </label>
              <select
                value={selectedFont}
                onChange={(e) => setSelectedFont(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                <option value="Inter">Inter</option>
                <option value="Playfair Display">Playfair Display</option>
                <option value="Poppins">Poppins</option>
                <option value="Bebas Neue">Bebas Neue</option>
                <option value="Pacifico">Pacifico</option>
                <option value="Montserrat">Montserrat</option>
                <option value="Roboto">Roboto</option>
                <option value="Dancing Script">Dancing Script</option>
                <option value="Anton">Anton</option>
                <option value="Permanent Marker">Permanent Marker</option>
              </select>
            </div>

            {/* Text Size */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#64748b' }}>
                Size: {textSize}px
              </label>
              <input
                type="range"
                min="12"
                max="72"
                value={textSize}
                onChange={(e) => setTextSize(parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Text Color */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#64748b' }}>
                Text Color
              </label>
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              />
            </div>

            {/* Alignment */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#64748b' }}>
                Alignment
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setTextAlign('left')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: textAlign === 'left' ? '#8b5cf6' : 'white',
                    color: textAlign === 'left' ? 'white' : '#64748b',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  Left
                </button>
                <button
                  onClick={() => setTextAlign('center')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: textAlign === 'center' ? '#8b5cf6' : 'white',
                    color: textAlign === 'center' ? 'white' : '#64748b',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  Center
                </button>
                <button
                  onClick={() => setTextAlign('right')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: textAlign === 'right' ? '#8b5cf6' : 'white',
                    color: textAlign === 'right' ? 'white' : '#64748b',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  Right
                </button>
              </div>
            </div>

          {/* Add Text Button */}
          <button
            onClick={() => {
              console.log('Button clicked!');
              console.log('Current textInput:', textInput);
              console.log('Current textList length:', textList.length);
              
              if (textInput.trim() && textList.length < 3) {
                console.log('Adding text to list!');
                const newText = {
                  id: Date.now(),
                  text: textInput,
                  font: selectedFont,
                  color: textColor,
                  size: textSize,
                  align: textAlign,
                  x: 50,
                  y: 50
                };
                console.log('New text object:', newText);
                setTextList([...textList, newText]);
                setTextInput('');
              } else {
                console.log('Validation failed!');
                console.log('textInput.trim():', textInput.trim());
                console.log('textList.length < 3:', textList.length < 3);
              }
            }}
            disabled={textList.length >= 3 || !textInput.trim()}
            style={{
              width: '100%',
              padding: '10px',
              background: (textList.length >= 3 || !textInput.trim()) ? '#cbd5e1' : '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: (textList.length >= 3 || !textInput.trim()) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <i className="fas fa-plus"></i>
            Add Text to Video
          </button>

          {/* Text List */}
          {textList.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                {textList.length} text overlay(s) added
              </p>
              {textList.map((item) => (
                <div key={item.id} style={{
                  padding: '8px',
                  background: 'white',
                  borderRadius: '6px',
                  marginBottom: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px'
                }}>
                  <span style={{ fontFamily: item.font, color: item.color }}>
                    {item.text.substring(0, 20)}{item.text.length > 20 ? '...' : ''}
                  </span>
                  <button
                    onClick={() => setTextList(textList.filter(t => t.id !== item.id))}
                    style={{
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          </div>

            {/* Export For Section */}
            <div style={{
              background: '#f8fafc',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>Export For</h4>
                      
            {/* Letterbox Checkbox */}
            <div style={{
              background: 'white',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '16px',
              border: '2px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <input
                type="checkbox"
                id="letterbox-checkbox"
                checked={letterboxMode}
                onChange={(e) => setLetterboxMode(e.target.checked)}
                style={{
                  width: '20px',
                  height: '20px',
                  cursor: 'pointer'
                }}
              />
              <label
                htmlFor="letterbox-checkbox"
                style={{
                  fontSize: '14px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  flex: 1
                }}
              >
                <strong>Preserve all content (letterbox)</strong>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  {letterboxMode
                    ? 'Adds black bars to show full video without cropping'
                    : 'Crops edges to fill frame completely (recommended for social media)'}
                </div>
              </label>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                <button
                  onClick={() => handleExport('TikTok')}
                  style={{
                    padding: '16px',
                    background: 'white',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                >
                  <i className="fab fa-tiktok" style={{ fontSize: '32px', color: '#000000' }}></i>
                  <span style={{ fontSize: '12px', fontWeight: '600' }}>TikTok</span>
                </button>

                <button
                  onClick={() => handleExport('YouTube')}
                  style={{
                    padding: '16px',
                    background: 'white',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                >
                  <i className="fab fa-youtube" style={{ fontSize: '32px', color: '#FF0000' }}></i>
                  <span style={{ fontSize: '12px', fontWeight: '600' }}>YouTube</span>
                </button>

                <button
                  onClick={() => handleExport('Instagram')}
                  style={{
                    padding: '16px',
                    background: 'white',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                >
                  <i className="fab fa-instagram" style={{ fontSize: '32px', color: '#E4405F' }}></i>
                  <span style={{ fontSize: '12px', fontWeight: '600' }}>Instagram</span>
                </button>

                <button
                  onClick={() => handleExport('Facebook')}
                  style={{
                    padding: '16px',
                    background: 'white',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                >
                  <i className="fab fa-facebook" style={{ fontSize: '32px', color: '#1877F2' }}></i>
                  <span style={{ fontSize: '12px', fontWeight: '600' }}>Facebook</span>
                </button>
              </div>
            </div>

            {/* Download Button */}
            <button
              onClick={handleDownload}
              style={{
                width: '100%',
                padding: '14px',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)'
              }}
            >
              <i className="fas fa-download"></i>
              Download Edited Clip
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}

export default ClipEditorModal;
