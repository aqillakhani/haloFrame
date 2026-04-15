import { useState, type ChangeEvent } from 'react';

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
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLocalPreview(URL.createObjectURL(file));
    onFileSelected(file);
    // Reset so the same file can be picked again if the parent resets state
    event.target.value = '';
  };

  const display = previewUrl ?? localPreview;

  return (
    <div className={`upload-zone${display ? ' has-image' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input
        className="upload-zone-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={handleChange}
        disabled={disabled}
        aria-label={label}
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
