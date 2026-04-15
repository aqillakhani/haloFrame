// =============================================================================
// EternalFrame v1.3 — All user-facing copy, centralized
// =============================================================================

export const COPY = {
  appName: 'EternalFrame',
  tagline: 'A gentle place to honor those we love',

  home: {
    enhance: {
      title: 'Honor a Photo',
      subtitle: 'Add wings, halos, or heavenly light',
    },
    reunite: {
      title: 'Add Someone to a Photo',
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
    },
    merging: {
      message: 'Bringing them together\u2026',
      hint: 'This takes about 10\u201320 seconds',
    },
    review: {
      heading: 'How does this look?',
      tryDifferent: 'Try Again',
      looksGood: 'Looks Good',
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
    saveButton: 'Save to Phone',
    startOver: 'Start Over',
    tryDifferentPosition: 'Try Again',
    download: 'Save to Phone',
    noSelection: 'Choose a style',
    seeTribute: 'See Your Tribute',
    loadingPreview: 'Loading preview\u2026',
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
  },

  myTributes: {
    emptyHeading: 'No tributes yet',
    emptySubtext: 'Your saved tributes will appear here',
    emptyCta: 'Create Your First Tribute',
  },

  tabs: {
    home: 'Home',
    myTributes: 'My Tributes',
    settings: 'Settings',
    print: 'Print',
  },
} as const;
