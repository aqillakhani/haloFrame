import { useNavigation } from '../lib/navigation';

interface BackButtonProps {
  /** Override the default pop behavior */
  onClick?: () => void;
  label?: string;
}

export function BackButton({ onClick, label = 'Go back' }: BackButtonProps) {
  const nav = useNavigation();

  if (!nav.canGoBack && !onClick) return null;

  return (
    <button
      type="button"
      className="back-button"
      onClick={onClick ?? nav.pop}
      aria-label={label}
    >
      &#8592;
    </button>
  );
}
