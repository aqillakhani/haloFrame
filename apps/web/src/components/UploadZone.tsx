import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Icon } from './icons/Icon';

interface UploadZoneProps {
  label: string;
  hint?: string;
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  previewUrl?: string | null;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

export function UploadZone({ label, hint, onFileSelected, disabled, previewUrl }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setLocalPreview(URL.createObjectURL(file));
    onFileSelected(file);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const display = previewUrl ?? localPreview;

  return (
    <label
      className={`upload-zone${isDragging ? ' upload-zone--drag' : ''}${display ? ' upload-zone--filled' : ''}${disabled ? ' upload-zone--disabled' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        className="upload-zone-input"
        type="file"
        accept={ACCEPT}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
      {display ? (
        <img src={display} alt="Selected photo preview" className="upload-zone-preview" />
      ) : (
        <div className="upload-zone-empty">
          <Icon name="upload" size={28} className="upload-zone-icon" />
          <p className="t-label-md">{label}</p>
          {hint && <p className="t-body-sm t-muted">{hint}</p>}
          <p className="t-body-sm t-muted upload-zone-hint">JPG &middot; PNG &middot; HEIC</p>
        </div>
      )}
    </label>
  );
}
