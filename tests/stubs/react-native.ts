export const Platform = { OS: 'test' };
export const Share = { async share() {} };
export const AppState = {
  currentState: 'active',
  addEventListener() {
    return { remove() {} };
  },
};
