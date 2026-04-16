import { motion } from 'framer-motion';
import { useNavigation, type Screen } from '../lib/navigation';
import { heroText, cardReveal } from '../lib/motion';
import { HaloGlyph } from '../components/icons/HaloGlyph';
import { Icon } from '../components/icons/Icon';

interface FlowCard {
  id: string;
  screen: Screen;
  title: string;
  subtitle: string;
  sample: string;
}

const CARDS: FlowCard[] = [
  {
    id: 'enhance',
    screen: 'ENHANCE_FLOW',
    title: 'Honor a photo',
    subtitle: 'Restore and adorn one you already have.',
    sample: '/samples/heavens_light.jpg',
  },
  {
    id: 'reunite',
    screen: 'REUNITE_FLOW',
    title: 'Bring them back',
    subtitle: 'Add a loved one into a photo they\u2019d belong in.',
    sample: '/samples/halo_and_wings.jpg',
  },
];

export function HomeScreen() {
  const nav = useNavigation();

  return (
    <div className="home">
      <header className="home-mark" aria-label="EternalFrame">
        <HaloGlyph size={28} />
      </header>

      <motion.section
        className="home-hero"
        variants={heroText}
        initial="initial"
        animate="animate"
      >
        <p className="t-display-lg t-italic t-muted home-eyebrow">In loving memory.</p>
        <h1 className="t-display-xl">
          Create a tribute that holds the feeling, not just the photo.
        </h1>
        <hr className="hairline-short home-hr" aria-hidden />
      </motion.section>

      <div className="home-cards">
        {CARDS.map((c, i) => (
          <motion.button
            key={c.id}
            type="button"
            className="home-card"
            variants={cardReveal}
            initial="initial"
            animate="animate"
            custom={i}
            onClick={() => nav.push(c.screen)}
          >
            <div
              className="home-card-photo"
              style={{ backgroundImage: `url(${c.sample})` }}
              aria-hidden
            />
            <div className="home-card-body">
              <h2 className="t-display-md">{c.title}</h2>
              <p className="t-body-md t-muted">{c.subtitle}</p>
              <span className="home-card-cta">
                Begin <Icon name="chevronRight" size={16} />
              </span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
