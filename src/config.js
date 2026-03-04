export const CONFIG = {
  TILE_SIZE:        7,
  ZONE_SCALE:       4,
  GRID_W:         480,
  GRID_H:         480,
  SHORE_W:        1.8,
  ZOOM_MIN:       0.4,
  ZOOM_MAX:       4.0,
  ZOOM_STEP:      0.15,
  ZOOM_WHEEL:     0.12,
  PHOTO_PRE_MAX: 2048,
  PHOTO_MAX_W:    800,
  PHOTO_QUALITY:  0.75,
};

export const T = { DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, DGRASS: 4, FOREST: 5 };

export const BASE_COLOR = {
  [0]: '#1a3f8c',  // DEEP
  [1]: '#4aa8d8',  // SHALLOW
  [2]: '#e8a322',  // SAND
  [3]: '#44a318',  // GRASS
  [4]: '#328530',  // DGRASS
  [5]: '#1a4a0a',  // FOREST
};

export const firebaseConfig = {
  apiKey:            'AIzaSyCq0apieaxh4xaAoJBJ5Evam_jnNOr8yBw',
  authDomain:        'gen-lang-client-0378444111.firebaseapp.com',
  projectId:         'gen-lang-client-0378444111',
  storageBucket:     'gen-lang-client-0378444111.firebasestorage.app',
  messagingSenderId: '440342290540',
  appId:             '1:440342290540:web:894148c0d604d2eaa33849',
};
