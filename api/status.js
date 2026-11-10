const { hatSchluessel, MODELL_ASSISTENT, MODELL_PRUEFER } = require('../lib/openai');
const { REGELN_VERSION, KATALOG, STICHPROBE_ANTEIL } = require('../lib/regeln');
const { PROMPT_VERSION } = require('../lib/prompts');

module.exports = (req, res) => {
  res.status(200).json({
    ki: hatSchluessel(),
    modellAssistent: MODELL_ASSISTENT(),
    modellPruefer: MODELL_PRUEFER(),
    passwort: !!(process.env.APP_PASSWORT || '').trim(),
    regeln: REGELN_VERSION,
    katalog: KATALOG.map(k => ({ id: k.id, text: k.text })),
    stichprobe: STICHPROBE_ANTEIL,
    prompt: PROMPT_VERSION
  });
};
