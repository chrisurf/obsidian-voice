// Jest transform: import a .yaml file as its text, like esbuild's text loader.
module.exports = {
  process(source) {
    return { code: `module.exports = ${JSON.stringify(source)};` };
  },
};
