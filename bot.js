import { ChannelType, Client, GatewayIntentBits, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
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

const announceCmd = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Annonce une compétition WCA')
  .addStringOption((o) => o.setName('url').setDescription('URL ou id de la compétition WCA').setRequired(true))
  .addBooleanOption((o) => o.setName('private').setDescription('Aperçu visible seulement par toi, sans @everyone'))
  .setDefaultMemberPermissions(PermissionFlagsBits.MentionEveryone)
  .setContexts(InteractionContextType.Guild);

const projetCmd = new SlashCommandBuilder()
  .setName('projet')
  .setDescription('Crée la catégorie et les salons d’un projet de compétition')
  // 100-char Discord limit minus '-private'.
  .addStringOption((o) => o.setName('nom').setDescription('Nom du projet').setRequired(true).setMaxLength(92))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .setContexts(InteractionContextType.Guild);

async function announce(i, log) {
  const id = compId(i.options.getString('url'));
  const comp = id && (await getComp(id));
  if (!comp) {
    log('not found');
    return 'Compétition introuvable.';
  }
  if (i.options.getBoolean('private')) {
    log('private preview');
    return { content: format(comp), allowedMentions: { parse: [] } };
  }
  // Sent as a new message: mentions in an edited interaction reply don't notify.
  await i.channel.send({ content: format(comp), allowedMentions: ping });
  log('posted');
  return 'Annonce publiée.';
}

const ABOVE_CATEGORY = '1019989519166095360';
const PUBLIC_ROLES = ['Administrateur', 'Modérateur', 'Délégué WCA', 'Organisateur'];
const PRIVATE_ROLE = 'QC-Delegates';

async function projet(i, log) {
  const name = i.options.getString('nom').trim();
  const { guild } = i;
  const ids = {};
  const bad = [];
  for (const n of [...PUBLIC_ROLES, PRIVATE_ROLE]) {
    const found = guild.roles.cache.filter((r) => r.name === n);
    if (found.size === 1) ids[n] = found.first().id;
    else bad.push(n);
  }
  const above = guild.channels.cache.get(ABOVE_CATEGORY);
  const problem = bad.length ? `Rôle introuvable ou en double: ${bad.join(', ')}` : !above && `Catégorie ${ABOVE_CATEGORY} introuvable.`;
  if (problem) {
    log(problem);
    return problem;
  }
  // The bot's own entry keeps it able to add channels inside the hidden category.
  const allow = (id) => ({ id, allow: [PermissionFlagsBits.ViewChannel] });
  const view = (names) => [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    allow(client.user.id),
    ...names.map((n) => allow(ids[n])),
  ];
  const created = [];
  const create = async (opts) => {
    const c = await guild.channels.create(opts);
    created.push(c);
    return c;
  };
  try {
    const parent = await create({ name, type: ChannelType.GuildCategory, permissionOverwrites: view(PUBLIC_ROLES) });
    await parent.setPosition(above.position);
    const text = (suffix, names) =>
      create({ name: `${name}-${suffix}`, type: ChannelType.GuildText, parent, permissionOverwrites: view(names) });
    const pub = await text('public', PUBLIC_ROLES);
    const priv = await text('private', [PRIVATE_ROLE]);
    log('created');
    return `Projet créé: ${pub} ${priv}`;
  } catch (e) {
    // Deleting a category leaves its children, so remove each one.
    for (const c of created.reverse()) await c.delete().catch(() => {});
    throw e;
  }
}

const handlers = { announce, projet };

client.on('interactionCreate', async (i) => {
  const handler = i.isChatInputCommand() && handlers[i.commandName];
  if (!handler) return;
  const label = `/${i.commandName} ${i.options.data[0]?.value ?? ''}`;
  const who = `${i.user.tag} in #${i.channel?.name}`;
  try {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await i.editReply(await handler(i, (what) => console.log(`${label}: ${what} (${who})`)));
  } catch (e) {
    console.error(`${label} failed (${who})`, e);
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
  await client.application.commands.set([announceCmd, projetCmd]);
  console.log(`logged in as ${client.user.tag}`);
  schedule();
});

client.login(process.env.DISCORD_TOKEN);
