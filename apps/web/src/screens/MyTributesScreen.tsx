import { motion, useReducedMotion } from 'framer-motion';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';
import { HaloIllustration } from '../components/illustrations/HaloIllustration';

const gentleEase = [0.22, 0.61, 0.36, 1] as const;

export function MyTributesScreen() {
  const nav = useNavigation();
  const reduceMotion = useReducedMotion();
  return (
    <div className="empty">
      <hr className="hairline-short" aria-hidden />
      <motion.div
        className="empty-illustration"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3, ...(reduceMotion ? {} : { y: [0, -4, 0] }) }}
        transition={{
          opacity: { duration: 0.56, ease: gentleEase },
          ...(reduceMotion
            ? {}
            : {
                y: {
                  duration: 3.2,
                  ease: 'easeInOut',
                  repeat: Infinity,
                  repeatType: 'loop' as const,
                  delay: 0.56,
                },
              }),
        }}
      >
        <HaloIllustration />
      </motion.div>
      <hr className="hairline-short" aria-hidden />
      <motion.h1
        className="t-display-lg empty-headline"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.56, ease: gentleEase }}
      >
        {COPY.myTributes.emptyHeading}
      </motion.h1>
      <motion.p
        className="t-body-md t-muted empty-body"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.56, ease: gentleEase, delay: 0.12 }}
      >
        {COPY.myTributes.emptySubtext}
      </motion.p>
      <motion.button
        type="button"
        className="btn btn-primary"
        onClick={() => nav.setTab('HOME')}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.56, ease: gentleEase, delay: 0.24 }}
      >
        {COPY.myTributes.emptyCta}
      </motion.button>
    </div>
  );
}
