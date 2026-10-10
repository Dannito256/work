export default {
  name: 'goodbye',
  async handle(payload, sock, { store, config, utils, logger }) {
    if (payload?.action !== 'remove' || !payload.participants?.length) return;

    const settings = store.group(payload.id);
    if (!settings.goodbye) return;

    const mentions = payload.participants.map((jid) => utils.normalizeJid(jid));
    const tags = mentions.map((jid) => `@${utils.jidToNumber(jid)}`);

    let subject = 'this group';
    try {
      const meta = await sock.groupMetadata(payload.id);
      subject = meta?.subject || subject;
    } catch (error) {
      logger.debug({ err: error }, 'Goodbye: could not read group subject');
    }

    const fallback = `Goodbye ${tags.join(', ')}. Thanks for being part of *${subject}*.`;
    const text = (settings.goodbyeText || fallback)
      .replace(/@user/g, tags.join(' '))
      .replace(/@group/g, subject)
      .replace(/@count/g, String(mentions.length));

    try {
      await sock.sendMessage(payload.id, { text, mentions });
    } catch (error) {
      logger.error({ err: error }, 'Failed to send goodbye message');
    }
  }
};
        
