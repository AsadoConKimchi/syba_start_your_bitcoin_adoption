// AsyncStorage mock for jest tests
const store = {};

const AsyncStorage = {
  getItem: jest.fn((key) => Promise.resolve(store[key] || null)),
  setItem: jest.fn((key, value) => {
    store[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key) => {
    delete store[key];
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    Object.keys(store).forEach((key) => delete store[key]);
    return Promise.resolve();
  }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
  multiGet: jest.fn((keys) =>
    Promise.resolve(keys.map((key) => [key, store[key] || null]))
  ),
  multiSet: jest.fn((pairs) => {
    pairs.forEach(([key, value]) => { store[key] = value; });
    return Promise.resolve();
  }),
  multiRemove: jest.fn((keys) => {
    keys.forEach((key) => delete store[key]);
    return Promise.resolve();
  }),
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
