import { FrameIllustration } from '../components/illustrations/FrameIllustration';

export function PrintShopScreen() {
  return (
    <div className="empty">
      <hr className="hairline-short" aria-hidden />
      <div className="empty-illustration"><FrameIllustration /></div>
      <hr className="hairline-short" aria-hidden />
      <h1 className="t-display-lg empty-headline">Prints are coming.</h1>
      <p className="t-body-md t-muted empty-body">
        Your tributes, framed and ready for a mantelpiece. Details soon.
      </p>
    </div>
  );
}
