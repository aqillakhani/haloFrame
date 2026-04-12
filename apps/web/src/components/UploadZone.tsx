import { useRef, useState, type ChangeEvent } from 'react';

interface UploadZoneProps {
  label: string;
  hint?: string;
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  previewUrl?: string | null;
}

export function UploadZone({
  label,
  hint,
  onFileSelected,
  disabled,
  previewUrl,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLocalPreview(URL.createObjectURL(file));
    onFileSelected(file);
  };

  const display = previewUrl ?? localPreview;

  return (
    <div
      className={`upload-zone${display ? ' has-image' : ''}`}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleChange}
        disabled={disabled}
      />
      {display ? (
        <img className="upload-preview" src={display} alt="preview" />
      ) : (
        <>
          <h3>{label}</h3>
          {hint && <p className="muted">{hint}</p>}
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Click to choose</p>
        </>
      )}
    </div>
  );
}
