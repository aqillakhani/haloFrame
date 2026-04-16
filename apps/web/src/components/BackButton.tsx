import { useNavigation } from '../lib/navigation';
import { Icon } from './icons/Icon';

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
      className="btn-icon back-btn"
      onClick={onClick ?? nav.pop}
      aria-label={label}
    >
      <Icon name="back" size={20} />
    </button>
  );
}
