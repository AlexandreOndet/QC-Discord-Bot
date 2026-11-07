import { Client, GatewayIntentBits, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { format, compId, announcedIn, windowEnd } from './format.js';

const WCA = 'https://www.worldcubeassociation.org/api/v0/competitions';

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30e3) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`WCA ${res.status} for ${url}`);
  return res.json();
}

const getComp = (id) => getJson(`${WCA}/${id}`);

// 25 latest-announced CA comps; far more than one window ever brings.
const newQuebecComps = async (end, minutes) =>
  (await getJson(`${WCA}?country_iso2=CA&sort=-announced_at&per_page=25`))
    .filter((c) => c.city.endsWith(', Quebec') && announcedIn(c, end, minutes));

if (process.argv[2] === 'print') {
  const id = compId(process.argv[3] ?? '');
  const comp = id && (await getComp(id));
  if (!comp) throw new Error('Unknown competition');
  console.log(format(comp));
  process.exit(0);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.on('error', console.error);
const ping = { parse: ['everyone'] };

const command = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Annonce une compétition WCA')
  .addStringOption((o) => o.setName('url').setDescription('URL ou id de la compétition WCA').setRequired(true))
  .addBooleanOption((o) => o.setName('private').setDescription('Aperçu visible seulement par toi, sans @everyone'))
  .setDefaultMemberPermissions(PermissionFlagsBits.MentionEveryone)
  .setContexts(InteractionContextType.Guild);

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand() || i.commandName !== 'announce') return;
  const input = i.options.getString('url');
  const who = `${i.user.tag} in #${i.channel?.name}`;
  try {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const id = compId(input);
    const comp = id && (await getComp(id));
    if (!comp) {
      console.log(`/announce ${input}: not found (${who})`);
      return await i.editReply('Compétition introuvable.');
    }
    if (i.options.getBoolean('private')) {
      console.log(`/announce ${id}: private preview (${who})`);
      return await i.editReply({ content: format(comp), allowedMentions: { parse: [] } });
    }
    // Sent as a new message: mentions in an edited interaction reply don't notify.
    await i.channel.send({ content: format(comp), allowedMentions: ping });
    console.log(`/announce ${id}: posted (${who})`);
    await i.editReply('Annonce publiée.');
  } catch (e) {
    console.error(`/announce ${input} failed (${who})`, e);
    await i.editReply(`Erreur: ${e.message}`).catch(() => {});
  }
});

const EVERY = 5; // minutes per check window
// ponytail: fixed delay for WCA list lag; a comp showing up later than this is never announced.
const LAG = 2 * 60e3;

async function postNew(end, minutes) {
  const channel = await client.channels.fetch(process.env.ANNOUNCE_CHANNEL_ID);
  const comps = await newQuebecComps(end, minutes);
  if (comps.length || minutes > EVERY) console.log(`check (${minutes} min before ${new Date(end).toISOString()}): ${comps.length} new`);
  for (const c of comps) {
    await channel.send({ content: format(c), allowedMentions: ping });
    console.log(`announced ${c.id} in #${channel.name}`);
  }
}

async function check(end, attempt = 1) {
  try {
    await postNew(end, EVERY);
  } catch (e) {
    console.error(`check for ${new Date(end).toISOString()} attempt ${attempt} failed`, e);
    if (attempt < 4) setTimeout(() => check(end, attempt + 1), 60e3);
  }
}

function schedule() {
  const end = windowEnd(Date.now() - LAG, EVERY) + EVERY * 60e3;
  setTimeout(() => {
    check(end);
    schedule();
  }, end + LAG - Date.now());
}

// Visible proof of life without a log line every 5 minutes.
setInterval(() => console.log('alive'), 3600e3);

client.once('clientReady', async () => {
  if (process.argv[2] === 'check') {
    await postNew(windowEnd(Date.now(), EVERY), Number(process.argv[3] ?? 1) * 60);
    process.exit(0);
  }
  await client.application.commands.set([command]);
  console.log(`logged in as ${client.user.tag}`);
  schedule();
});

client.login(process.env.DISCORD_TOKEN);
