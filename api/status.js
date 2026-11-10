const { hatSchluessel, MODELL_ASSISTENT, MODELL_PRUEFER } = require('../lib/openai');
const { REGELN_VERSION } = require('../lib/regeln');
const { PROMPT_VERSION } = require('../lib/prompts');

module.exports = (req, res) => {
  res.status(200).json({
    ki: hatSchluessel(),
    modellAssistent: MODELL_ASSISTENT(),
    modellPruefer: MODELL_PRUEFER(),
    passwort: !!(process.env.APP_PASSWORT || '').trim(),
    regeln: REGELN_VERSION,
    prompt: PROMPT_VERSION
  });
};
