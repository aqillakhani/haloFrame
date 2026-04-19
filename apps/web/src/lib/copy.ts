// =============================================================================
// HaloFrame v1.3 — All user-facing copy, centralized
// =============================================================================

export const COPY = {
  appName: 'HaloFrame',
  tagline: 'A gentle place to honor those we love',

  home: {
    enhance: {
      title: 'Honor a Photo',
      subtitle: 'Add wings, halos, or heavenly light',
    },
    reunite: {
      title: 'Add a Loved One to a Photo',
      subtitle: 'Bring a loved one into the picture',
    },
  },

  enhance: {
    upload: {
      heading: 'Pick a photo',
      subtext: 'Pick a photo of your loved one or your family',
      uploadLabel: 'Choose from Photos',
      uploadHint: 'Any JPEG or PNG',
    },
    segmenting: {
      message: 'Looking at your photo\u2026',
      hint: 'Just a few seconds',
    },
    selectSubject: {
      heading: 'Who is this for?',
      subtext: 'Tap their number',
    },
    noFaces:
      'We couldn\u2019t find anyone in this photo \u2014 try a clearer one.',
    segmentFailed: 'Something went wrong \u2014 let\u2019s try again.',
  },

  reunite: {
    upload: {
      heading: 'Pick the main photo',
      subtext: 'This is the photo you want to add someone to',
      lovedHeading: 'Pick their photo',
      lovedSubtext: 'Choose a clear photo of your loved one',
      continueButton: 'Continue',
    },
    placement: {
      heading: 'Where should they go?',
      options: {
        left: 'Left Side',
        right: 'Right Side',
        behind: 'Behind',
        front: 'In Front',
      } as Record<string, string>,
      sizeLabel: 'Their size',
      sizeSmaller: 'Smaller',
      sizeLarger: 'Larger',
      confirmButton: 'Bring Them Together',
      previewBadge: 'Rough Preview',
      previewHint: 'Final result will look natural \u2014 we\u2019ll blend the lighting and shadows after you continue.',
    },
    merging: {
      // Cycled every ~4s while the merge runs so a 20-second wait feels
      // narrated, not silent. Keep each line short + warm.
      messages: [
        'Bringing them together\u2026',
        'Matching the lighting\u2026',
        'Adjusting the sunlight\u2026',
        'Feathering the edges\u2026',
        'Adding a natural shadow\u2026',
        'Finishing touches\u2026',
      ] as const,
      hint: 'This takes about 60\u201390 seconds',
    },
    review: {
      heading: 'How does this look?',
      tryDifferent: 'Try Again',
      looksGood: 'Looks Good',
      savePhoto: 'Save to Photos',
      addStyles: 'Add Styles',
    },
    mergeFailed:
      'That didn\u2019t work \u2014 try again or pick a different spot.',
  },

  editor: {
    styleHeading: 'Pick a style',
    styleHelper: 'Tap a style to apply it',
    styledChip: 'Styled',
    originalChip: 'Original',
    viewerHint: 'Pinch to zoom \u00b7 drag to pan \u00b7 double-click to reset',
    creating: 'Creating your tribute\u2026',
    styleFailed:
      'Something went wrong \u2014 let\u2019s try again.',
    saveButton: 'Save to Photos',
    orderCanvas: 'Order Canvas',
    startOver: 'Start Over',
    tryDifferentPosition: 'Try Again',
    download: 'Save to Photos',
    seeTribute: 'See Your Tribute',
    preparingStyles: (done: number, total: number) =>
      `Preparing your styles\u2026 ${done}/${total} ready`,
  },

  loading: {
    creatingTribute: 'Creating your tribute\u2026',
    mergingPhotos: 'Bringing them together\u2026',
    makingPerfect: 'Making it perfect\u2026',
    adjustingSize: 'Adjusting the size\u2026',
  },

  errors: {
    general: {
      heading: 'Something went wrong',
      subtext: 'Don\u2019t worry \u2014 let\u2019s try again',
      button: 'Try Again',
    },
    mergeWrong: {
      heading: 'That didn\u2019t work',
      subtext: 'Try again or pick a different spot',
      tryAgain: 'Try Again',
      goBack: 'Go Back',
    },
    loadStyles:
      'Something went wrong loading your styles \u2014 let\u2019s try again.',
    uploadPhoto:
      'That photo didn\u2019t upload \u2014 try again or pick a different one.',
  },

  myTributes: {
    emptyHeading: 'No tributes yet',
    emptySubtext: 'Your saved tributes will appear here',
    emptyCta: 'Create Your First Tribute',
  },

  saved: {
    title: 'Saved to your photos',
    subtitle: 'What would you like to do next?',
    orderCanvas: 'Order Canvas',
    startAnother: 'Start Another Photo',
  },

  subscription: {
    // Plan-picker header (calm / Settings-tab variant)
    heading: 'A quiet place to honor them',
    subheading: 'Every tribute you save uses one credit. Pick the plan that fits.',

    // Paywall mid-flow variant (user hit Save with zero tributes remaining)
    paywallHeading: 'Continue honoring them.',
    paywallSubheadPlural: (n: number) =>
      n === 1
        ? 'You\u2019ve used your 1 tribute.'
        : `You\u2019ve used your ${n} tributes.`,
    paywallCloseAria: 'Close, return to your tribute',
    paywallFooterLine1: 'Subscriptions renew automatically.',
    paywallFooterLine2: 'Cancel anytime in Settings.',

    // Settings-tab membership view
    settingsHeading: 'Your membership',
    currentPlanOnLabel: (planName: string) => `You\u2019re on ${planName}`,
    extendCtaFree: 'Extend membership',
    extendCtaKeepsake: 'Extend your Keepsake membership',
    // extendCta already exists above for Heritage

    // Per-plan CTA copy (keyed by SubscriptionPlanId)
    planCta: {
      free: 'Begin with Free',
      keepsake_monthly: 'Begin Keepsake membership',
      heritage_monthly: 'Begin Heritage membership',
      heritage_annual: 'Begin Heritage Annual',
      topup_4pack: 'Purchase 4-pack',
      topup_single: 'Purchase single tribute',
    } as Record<string, string>,

    // Tier labels (match SUBSCRIPTION_PLANS_UI names in shared constants)
    planFree: 'Free',
    planKeepsake: 'Keepsake',
    planHeritage: 'Heritage',

    // Taglines under each plan card
    freeTagline: 'Your first tributes, on us',
    keepsakeTagline: 'For remembering one loved one',
    heritageTagline: 'For families and genealogy',

    // Marketing tag
    bestValueTag: 'Best Value',

    // Rollover policy copy
    rolloverNone: 'Refreshes monthly \u2014 unused tributes don\u2019t carry over',
    rollover2Months: 'Refreshes monthly \u2014 up to two months roll over',

    // Credits remaining — tone-matched for a memorial audience
    creditsRemaining: (n: number) =>
      n === 1
        ? '1 tribute remaining this month'
        : `${n} tributes remaining this month`,
    creditsLifetime: (n: number) =>
      n === 1 ? '1 tribute to get started' : `${n} tributes to get started`,

    // Plan-card credit line (concise, fits in the card)
    creditsPerCycle: (n: number, period: string) =>
      period === '/month' ? `${n} tributes per month` : `${n} tributes a year`,

    // Chip-sized balance string for flow headers
    tributesShort: (n: number) => (n === 1 ? '1 tribute' : `${n} tributes`),

    // Empty-balance banner
    emptyBalance: 'You\u2019ve used your tributes for this month.',
    emptyBalanceSub: 'Add more below, or extend your Heritage membership.',

    // CTAs
    continueCta: 'Continue',
    extendCta: 'Extend your Heritage membership',
    addMoreCta: 'Add more tributes',
    manageCta: 'Manage membership',
    restoreCta: 'Restore purchase',

    // Top-up section
    topupHeading: 'Add more tributes',
    topupSubtitle: 'One-time purchase. Credits expire after 90 days.',

    // Fine print
    fineprint: 'Cancel anytime \u00b7 No commitment',
  },

  printShop: {
    heading: 'Order a Canvas',
    subheading: 'Gallery-wrapped, ready to hang. Ships in 5\u20137 days.',
    cta: 'Order',
    comingSoon: 'Checkout is coming soon.',
  },

  tabs: {
    home: 'Home',
    myTributes: 'My Tributes',
    settings: 'Settings',
    print: 'Print',
  },
} as const;
