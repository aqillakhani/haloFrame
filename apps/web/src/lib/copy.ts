// =============================================================================
// HaloFrame v1.3 — All user-facing copy, centralized
// =============================================================================

export const COPY = {
  appName: 'HaloFrame',
  tagline: 'A gentle place to honor those we love',

  home: {
    // Eyebrow renders as "Wednesday, a quiet afternoon". Weekday + phase computed at render time.
    phase: {
      morning: 'a quiet morning',
      afternoon: 'a quiet afternoon',
      evening: 'a quiet evening',
      night: 'a quiet night',
    },
    headlineBefore: 'For the ones ',
    headlineItalic: 'we carry',
    headlineAfter: ' with us.',
    subcopy: 'Choose how you\u2019d like to begin today.',
    sectionLabel: 'Begin a tribute',
    sectionIndex: 'Two paths',
    badgeOfFree: (n: number, total: number) => `of ${total} free`,
    badgeRemaining: 'tributes left',
    enhance: {
      kicker: 'Path one',
      title: 'Enhance',
      titleItalic: 'a photo',
      subtitle: 'A soft halo, wings, or a gentle glow on an existing photograph.',
      cta: 'Choose a photo',
    },
    reunite: {
      kicker: 'Path two',
      title: 'Reunite',
      titleItalic: 'with loved ones',
      subtitle: 'Gently place someone who\u2019s passed into a family photograph.',
      cta: 'Choose a family photo',
    },
    fine: 'Your photos are yours. They are never used to train models, and nothing is shared without your consent.',
  },

  enhance: {
    // New 2026-04-19 design keys — italic-split headings + per-step eyebrows.
    uploadEyebrow: 'Path one \u00b7 Enhance',
    segmentingEyebrow: 'Step two \u00b7 Looking',
    selectEyebrow: 'Step three \u00b7 Choose',
    stepLabel: (current: number, total: number) =>
      `Step ${String(current).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
    tryAgainCta: 'Try another photo',
    errorHint: 'Please try another',
    upload: {
      // Legacy flat string kept for any pre-port consumers.
      heading: 'Pick a photo',
      // Italic-split form used by the redesign.
      headingBefore: 'Pick a ',
      headingItalic: 'photograph',
      headingAfter: ' of the one you\u2019re honoring.',
      subtext: 'Pick a photo of your loved one or your family.',
      prefaceLabel: 'A single photograph, softly lit.',
      uploadLabel: 'Choose from Photos',
      uploadHint: 'Any JPEG or PNG',
      footText: 'Take a quiet moment \u2014 there\u2019s no rush.',
    },
    segmenting: {
      // Legacy flat strings.
      message: 'Looking at your photo\u2026',
      hint: 'Just a few seconds',
      // Italic-split form used by the redesign.
      headingBefore: 'A quiet moment while we ',
      headingItalic: 'look',
      headingAfter: '.',
    },
    selectSubject: {
      heading: 'Who is this for?',
      headingBefore: 'Who is ',
      headingItalic: 'this',
      headingAfter: ' for?',
      subtext: 'Tap their number.',
      helper: 'Tap a number to choose',
    },
    noFaces:
      'We couldn\u2019t find anyone in this photo \u2014 try a clearer one.',
    segmentFailed: 'Something went wrong \u2014 let\u2019s try again.',
  },

  reunite: {
    // 2026-04-19 claude.ai/design port — italic-split headings + per-step
    // eyebrows + stepdot labels. Four steps (upload → placement → merging
    // → review) with an overlaid saved modal.
    uploadEyebrow: 'Path two \u00b7 Reunite',
    placementEyebrow: 'Step two \u00b7 Where',
    mergingEyebrow: 'Step three \u00b7 Bringing together',
    reviewEyebrow: 'Step four \u00b7 How it looks',
    stepLabel: (current: number, total: number) =>
      `Step ${String(current).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
    uploadHint: 'Any JPEG or PNG',
    cardKickerMain: 'Photo one \u00b7 the gathering',
    cardKickerLoved: 'Photo two \u00b7 their likeness',
    chooseMainCta: 'Choose main photo',
    chooseLovedCta: 'Choose their photo',
    continueDisabledCta: 'Add both photos to continue',
    previewFileReady: 'Ready',
    changeCta: 'Change',
    upload: {
      heading: 'Pick the main photo',
      subtext: 'This is the photo you want to add someone to',
      lovedHeading: 'Pick their photo',
      lovedSubtext: 'Choose a clear photo of your loved one',
      continueButton: 'Continue',
      headingBefore: 'Bring them ',
      headingItalic: 'back',
      headingAfter: ' into the family photograph.',
      subhead: 'Two photographs. One to place them into, and one of them.',
    },
    placement: {
      heading: 'Where should they go?',
      options: {
        left: 'Left Side',
        right: 'Right Side',
        behind: 'Behind',
        front: 'In Front',
      } as Record<string, string>,
      // Single-word labels for the new four-up segmented control.
      optionsShort: {
        left: 'Left',
        right: 'Right',
        behind: 'Behind',
        front: 'Front',
      } as Record<string, string>,
      sizeLabel: 'Their size',
      sizeSmaller: 'Smaller',
      sizeLarger: 'Larger',
      confirmButton: 'Bring Them Together',
      previewBadge: 'Rough Preview',
      previewHint: 'Final result will look natural \u2014 we\u2019ll blend the lighting and shadows after you continue.',
      headingBefore: 'Where should they ',
      headingItalic: 'go',
      headingAfter: '?',
      subhead: 'Gentle preview \u2014 we\u2019ll blend the light after you continue.',
      placeLabelBefore: 'Their ',
      placeLabelItalic: 'place',
      sizeLabelBefore: 'Their ',
      sizeLabelItalic: 'size',
      roughBadge: 'Rough preview',
      confirmCta: 'Bring them together',
    },
    merging: {
      // Cycled every ~4s while the merge runs so a 60–90s wait feels
      // narrated, not silent. Keep each line short + warm. 2026-04-19
      // redesign: switched to the design handoff's copy ladder so the
      // caption reads like a camera-room whisper, not a progress bar.
      messages: [
        'Matching the lighting\u2026',
        'Softening the edges where they meet\u2026',
        'Adding a natural shadow beneath them\u2026',
        'Warming the tones to match the room\u2026',
        'Settling them into the scene\u2026',
        'Holding the moment steady\u2026',
      ] as const,
      hint: 'This takes about 60\u201390 seconds',
      headingBefore: 'We\u2019re ',
      headingItalic: 'bringing',
      headingAfter: ' them together.',
    },
    review: {
      heading: 'How does this look?',
      tryDifferent: 'Try Again',
      looksGood: 'Looks Good',
      savePhoto: 'Save to Photos',
      addStyles: 'Add Styles',
      headingBefore: 'How does ',
      headingItalic: 'this',
      headingAfter: ' look?',
      subhead: 'You can add a memorial style next, or save it as it is.',
      addStylesCta: 'Add a memorial style',
      savePhotoCta: 'Save photo',
      tryDifferentCta: 'Try a different arrangement',
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
    // 2026-04-19 redesign: copy tone tightened to match ReuniteFlow's
    // saved-modal handoff. Trailing period on `title` is load-bearing —
    // the design renders it as a full-stop "done." moment.
    title: 'Saved to your photos.',
    subtitle: 'What would you like to do next?',
    orderCanvas: 'Order Canvas',
    startAnother: 'Start another photo',
    closeAria: 'Close',
  },

  subscription: {
    // Plan-picker header (calm / Settings-tab variant)
    heading: 'A quiet place to honor them',
    subheading: 'Every tribute you save uses one credit. Pick the plan that fits.',

    // Paywall mid-flow variant (user hit Save with zero tributes remaining)
    // Heading is split so the italic/plum accent word can be styled independently.
    paywallHeadingBefore: 'Continue ',
    paywallHeadingItalic: 'honoring',
    paywallHeadingAfter: ' them.',
    /** Terracotta eyebrow kicker above the heading. */
    paywallEyebrow: 'Membership',
    /** Shown on the primary CTA when no plan is selected yet. */
    paywallNoSelectionCta: 'Choose a plan to begin',
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
    settingsNavLabel: 'Settings',
    settingsPlanPrefix: 'You\u2019re on',
    settingsMembershipEyebrow: 'Membership',
    settingsRenewsOn: (date: string) => `Renews ${date}`,
    settingsTributesLabel: 'tributes',
    settingsNoteEyebrow: 'On your membership',
    settingsNote: {
      free: 'Free memberships include a small number of tributes so you can try adding a halo, a pair of wings, or a quiet reunion for someone you\u2019ve lost.',
      keepsake: 'Keepsake renews each month with a fresh set of tributes \u2014 gentle room to revisit photographs and add halos, wings, or reunions.',
      heritage: 'Heritage gives a fuller monthly allowance of tributes and keeps your archive of saved memorials together, month to month.',
      heritageAnnual: 'Heritage Annual carries the same monthly allowance with a year\u2019s continuity \u2014 a quiet way to hold onto the work of remembering.',
    },
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

    // Fine print — two halves separated by a middle-dot. Settings renders
    // the separator at reduced opacity for a typographic beat.
    fineprint: {
      left: 'Cancel anytime',
      separator: '\u00b7',
      right: 'No commitment',
    },
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
