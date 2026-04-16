import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';
import { HaloIllustration } from '../components/illustrations/HaloIllustration';

export function MyTributesScreen() {
  const nav = useNavigation();
  return (
    <div className="empty">
      <hr className="hairline-short" aria-hidden />
      <div className="empty-illustration"><HaloIllustration /></div>
      <hr className="hairline-short" aria-hidden />
      <h1 className="t-display-lg empty-headline">{COPY.myTributes.emptyHeading}</h1>
      <p className="t-body-md t-muted empty-body">{COPY.myTributes.emptySubtext}</p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => nav.setTab('HOME')}
      >
        {COPY.myTributes.emptyCta}
      </button>
    </div>
  );
}
