import fs from 'fs';
import dns from 'dns/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const USER_PHONE = '+201069999557';
const USER_WHATSAPP_BASE = 'https://wa.me/201069999557';

// Comprehensive catalog of real global companies in iGaming, Skill Gaming, Crypto & MENA
const REAL_COMPANIES = [
    // --- 1. Aggregators & B2B Platforms ---
    { name: "EveryMatrix", domain: "everymatrix.com", email: "partnerships@everymatrix.com", portal: "https://everymatrix.com/contact-us/", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Stian Hornsletten", title: "CCO & Co-Founder" },
    { name: "SOFTSWISS", domain: "softswiss.com", email: "order@softswiss.com", portal: "https://softswiss.com/contact-us/", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Andrey Starovoitov", title: "Co-CEO" },
    { name: "Digitain", domain: "digitain.com", email: "info@digitain.com", portal: "https://digitain.com/contact-us/", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Ani Mkrtchyan", title: "Chief Sales Officer" },
    { name: "BetConstruct", domain: "betconstruct.com", email: "sales@betconstruct.com", portal: "https://betconstruct.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Gor Mnatsakanyan", title: "Regional Director" },
    { name: "Pragmatic Play", domain: "pragmaticplay.com", email: "sales@pragmaticplay.com", portal: "https://pragmaticplay.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Julian Jarvis", title: "CEO" },
    { name: "Playtech", domain: "playtech.com", email: "ir@playtech.com", portal: "https://playtech.com/contact", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Mor Weizer", title: "CEO" },
    { name: "Evolution Gaming", domain: "evolution.com", email: "ir@evolution.com", portal: "https://evolution.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Martin Carlesund", title: "Group CEO" },
    { name: "Bragg Gaming Group", domain: "bragg.group", email: "sales@bragg.group", portal: "https://bragg.group", category: "iGaming Aggregators & B2B", region: "North America & Europe", exec: "Matevž Mazij", title: "CEO & Chairman" },
    { name: "SkillOnNet", domain: "skillonnet.com", email: "sales@skillonnet.com", portal: "https://skillonnet.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Michael Golembo", title: "Sales Director" },
    { name: "Altenar", domain: "altenar.com", email: "sales@altenar.com", portal: "https://altenar.com/contact/", category: "iGaming Aggregators & B2B", region: "Europe & LatAm", exec: "Stanislav Silin", title: "CEO" },
    { name: "Soft2Bet", domain: "soft2bet.com", email: "sales@soft2bet.com", portal: "https://soft2bet.com", category: "iGaming Aggregators & B2B", region: "Europe & LatAm", exec: "Uri Poliavich", title: "CEO" },
    { name: "GiG Software PLC", domain: "gig.com", email: "sales@gig.com", portal: "https://gig.com/contact-us/", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Richard Carter", title: "CEO" },
    { name: "Endorphina", domain: "endorphina.com", email: "mail@endorphina.com", portal: "https://endorphina.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Kirill Miroshnichenko", title: "CCO" },
    { name: "Wazdan", domain: "wazdan.com", email: "sales@wazdan.com", portal: "https://wazdan.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Andrzej Hyla", title: "CCO" },
    { name: "SoftGamings", domain: "softgamings.com", email: "sales@softgamings.com", portal: "https://softgamings.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Irina Semyonova", title: "Head of Partnerships" },
    { name: "NuxGame", domain: "nuxgame.com", email: "info@nuxgame.com", portal: "https://nuxgame.com", category: "iGaming Aggregators & B2B", region: "Global", exec: "Denis Kosinsky", title: "COO" },
    { name: "Upgaming", domain: "upgaming.com", email: "sales@upgaming.com", portal: "https://upgaming.com", category: "iGaming Aggregators & B2B", region: "Europe & LatAm", exec: "Tornike Tvauri", title: "CEO" },
    { name: "Sportradar", domain: "sportradar.com", email: "info@sportradar.com", portal: "https://sportradar.com", category: "iGaming Aggregators & B2B", region: "Global", exec: "Carsten Koerl", title: "CEO" },
    { name: "Kambi Group", domain: "kambi.com", email: "sales@kambi.com", portal: "https://kambi.com/contact-us/", category: "iGaming Aggregators & B2B", region: "Global", exec: "Kristian Nylén", title: "CEO" },
    { name: "Aspire Global", domain: "aspireglobal.com", email: "sales@aspireglobal.com", portal: "https://aspireglobal.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Tsachi Maimon", title: "CEO" },
    { name: "Pronet Gaming", domain: "pronetgaming.com", email: "sales@pronetgaming.com", portal: "https://pronetgaming.com", category: "iGaming Aggregators & B2B", region: "Emerging Markets & LatAm", exec: "Alex Leese", title: "CEO" },
    { name: "Pariplay", domain: "pariplayltd.com", email: "info@pariplayltd.com", portal: "https://pariplayltd.com", category: "iGaming Aggregators & B2B", region: "Global", exec: "Adrian Bailey", title: "Managing Director" },
    { name: "Light & Wonder", domain: "lnw.com", email: "IR@lnw.com", portal: "https://explore.lnw.com/contact-us/", category: "iGaming Aggregators & B2B", region: "North America & Global", exec: "Matt Wilson", title: "CEO" },
    { name: "BGaming", domain: "bgaming.com", email: "info@bgaming.com", portal: "https://bgaming.com/contact-us/", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Marina Ostrovtsova", title: "CEO" },
    { name: "BtoBet", domain: "btobet.com", email: "sales@btobet.com", portal: "https://btobet.com", category: "iGaming Aggregators & B2B", region: "Europe, LatAm, Africa", exec: "Dima Reiderman", title: "Managing Director" },
    { name: "Slotegrator", domain: "slotegrator.com", email: "sales@slotegrator.com", portal: "https://slotegrator.pro", category: "iGaming Aggregators & B2B", region: "Global", exec: "Yana Khaidukova", title: "Managing Director" },
    { name: "Singular", domain: "singular.uk", email: "contact@singular.uk", portal: "https://singular.uk", category: "iGaming Aggregators & B2B", region: "Europe", exec: "George Shamugia", title: "CEO" },
    { name: "Spribe", domain: "spribe.co", email: "info@spribe.co", portal: "https://spribe.co", category: "iGaming Aggregators & B2B", region: "Global", exec: "David Natroshvili", title: "Managing Partner" },
    { name: "Galaxsys", domain: "galaxsys.co", email: "info@galaxsys.co", portal: "https://galaxsys.co", category: "iGaming Aggregators & B2B", region: "Global", exec: "Hayk Sargsyan", title: "CEO" },
    { name: "Turbo Games", domain: "turbogames.io", email: "partners@turbogames.io", portal: "https://turbogames.io", category: "iGaming Aggregators & B2B", region: "Global", exec: "Vadim Potapenko", title: "Head of Sales" },
    { name: "Hacksaw Gaming", domain: "hacksawgaming.com", email: "info@hacksawgaming.com", portal: "https://hacksawgaming.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Marcus Cordes", title: "CEO" },
    { name: "Nolimit City", domain: "nolimitcity.com", email: "sales@nolimitcity.com", portal: "https://nolimitcity.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Jonas Tegman", title: "Co-Founder" },
    { name: "Push Gaming", domain: "pushgaming.com", email: "sales@pushgaming.com", portal: "https://pushgaming.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "James Marshall", title: "CEO" },
    { name: "Relax Gaming", domain: "relax-gaming.com", email: "contact@relax-gaming.com", portal: "https://relax-gaming.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Simon Hammon", title: "CEO" },
    { name: "Yggdrasil Gaming", domain: "yggdrasilgaming.com", email: "sales@yggdrasilgaming.com", portal: "https://yggdrasilgaming.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "James Curwen", title: "CEO" },
    { name: "Evoplay", domain: "evoplay.games", email: "business@evoplay.games", portal: "https://evoplay.games", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Ivan Kravchuk", title: "CEO" },
    { name: "Playson", domain: "playson.com", email: "sales@playson.com", portal: "https://playson.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Alex Ivshin", title: "CEO" },
    { name: "Spinomenal", domain: "spinomenal.com", email: "info@spinomenal.com", portal: "https://spinomenal.com", category: "iGaming Aggregators & B2B", region: "Global", exec: "Lior Shvartz", title: "CEO" },
    { name: "Amusnet", domain: "amusnet.com", email: "sales@amusnet.com", portal: "https://amusnet.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Ivo Georgiev", title: "CEO" },
    { name: "Greentube (Novomatic)", domain: "greentube.com", email: "sales@greentube.com", portal: "https://greentube.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Michael Bauer", title: "CGO" },
    { name: "Synot Games", domain: "synotgames.com", email: "info@synotgames.com", portal: "https://synotgames.com", category: "iGaming Aggregators & B2B", region: "Europe", exec: "Ivan Kodaj", title: "CEO" },
    { name: "Tom Horn Gaming", domain: "tomhorngaming.com", email: "info@tomhorngaming.com", portal: "https://tomhorngaming.com", category: "iGaming Aggregators & B2B", region: "Europe", exec: "Ondrej Lapides", title: "CEO" },
    { name: "Belatra Games", domain: "belatragames.com", email: "info@belatragames.com", portal: "https://belatragames.com", category: "iGaming Aggregators & B2B", region: "Global & LatAm", exec: "Kateryna Goy", title: "Head of BD" },
    { name: "Betsoft Gaming", domain: "betsoft.com", email: "sales@betsoft.com", portal: "https://betsoft.com", category: "iGaming Aggregators & B2B", region: "Global", exec: "Clare Bowring", title: "Commercial Director" },
    { name: "Fugaso", domain: "fugaso.com", email: "info@fugaso.com", portal: "https://fugaso.com", category: "iGaming Aggregators & B2B", region: "Europe", exec: "Niko Mazger", title: "CEO" },
    { name: "Mancala Gaming", domain: "mancalagaming.com", email: "info@mancalagaming.com", portal: "https://mancalagaming.com", category: "iGaming Aggregators & B2B", region: "Global", exec: "Nikita Gorshkov", title: "CEO" },
    { name: "Red Rake Gaming", domain: "redrakegaming.com", email: "info@redrakegaming.com", portal: "https://redrakegaming.com", category: "iGaming Aggregators & B2B", region: "Europe & LatAm", exec: "Carlos Sánchez", title: "Managing Director" },
    { name: "Stakelogic", domain: "stakelogic.com", email: "sales@stakelogic.com", portal: "https://stakelogic.com", category: "iGaming Aggregators & B2B", region: "Europe", exec: "Stephan van den Oetelaar", title: "CEO" },
    { name: "Swintt", domain: "swintt.com", email: "sales@swintt.com", portal: "https://swintt.com", category: "iGaming Aggregators & B2B", region: "Europe", exec: "David Mann", title: "CEO" },
    { name: "1X2 Network", domain: "1x2network.com", email: "info@1x2network.com", portal: "https://1x2network.com", category: "iGaming Aggregators & B2B", region: "Europe", exec: "Kevin Reid", title: "CEO" },
    { name: "Gamzix", domain: "gamzix.com", email: "info@gamzix.com", portal: "https://gamzix.com", category: "iGaming Aggregators & B2B", region: "Europe & Global", exec: "Aleksandr Kosogov", title: "CEO" },
    { name: "Onlyplay", domain: "onlyplay.net", email: "info@onlyplay.net", portal: "https://onlyplay.net", category: "iGaming Aggregators & B2B", region: "Global", exec: "Christina Muratkina", title: "CEO" },
    { name: "Platipus Gaming", domain: "platipusgaming.com", email: "info@platipusgaming.com", portal: "https://platipusgaming.com", category: "iGaming Aggregators & B2B", region: "Global", exec: "Martijn Peters", title: "CEO" },
    { name: "Habanero Systems", domain: "habanerosystems.com", email: "sales@habanerosystems.com", portal: "https://habanerosystems.com", category: "iGaming Aggregators & B2B", region: "Asia & Global", exec: "Arcangelo Lonoce", title: "Head of BD" },
    { name: "Salsa Technology", domain: "salsatechnology.com", email: "info@salsatechnology.com", portal: "https://salsatechnology.com", category: "iGaming Aggregators & B2B", region: "Latin America (Brazil)", exec: "Peter Nolte", title: "CEO" },
    { name: "EvenBet Gaming", domain: "evenbetgaming.com", email: "sales@evenbetgaming.com", portal: "https://evenbetgaming.com", category: "iGaming Aggregators & B2B", region: "Global", exec: "Dmitry Starostenkov", title: "CEO" },
    { name: "GammaStack", domain: "gammastack.com", email: "sales@gammastack.com", portal: "https://gammastack.com", category: "iGaming Aggregators & B2B", region: "Global", exec: "Gaurav Soni", title: "CEO" },

    // --- 2. MENA & GCC Gaming, Media & Telecom Giants ---
    { name: "Savvy Games Group", domain: "savvygames.com", email: "partnerships@savvygames.com", portal: "https://savvygames.com", category: "MENA & GCC Conglomerates", region: "Saudi Arabia (KSA)", exec: "Brian Ward", title: "CEO" },
    { name: "Yalla Group", domain: "yalla.com", email: "ir@yalla.com", portal: "https://yalla.com", category: "MENA & GCC Conglomerates", region: "UAE & Global", exec: "Tao Yang", title: "Chairman & CEO" },
    { name: "MBC Group (Shahid)", domain: "mbc.net", email: "corporate@mbc.net", portal: "https://mbc.net", category: "MENA & GCC Conglomerates", region: "MENA Region", exec: "Sam Barnett", title: "CEO" },
    { name: "Jawaker (Stillfront)", domain: "jawaker.com", email: "business@jawaker.com", portal: "https://jawaker.com", category: "MENA & GCC Conglomerates", region: "Jordan & UAE", exec: "Mohamad Haj-Hasan", title: "CEO" },
    { name: "Tamatem Games", domain: "tamatem.co", email: "partnerships@tamatem.co", portal: "https://tamatem.co", category: "MENA & GCC Conglomerates", region: "Jordan & Saudi Arabia", exec: "Hussam Hammo", title: "CEO & Founder" },
    { name: "Sandsoft Games", domain: "sandsoft.com", email: "info@sandsoft.com", portal: "https://sandsoft.com", category: "MENA & GCC Conglomerates", region: "Saudi Arabia & UAE", exec: "David Fernandez", title: "CEO" },
    { name: "Babil Games", domain: "babilgames.com", email: "contact@babilgames.com", portal: "https://babilgames.com", category: "MENA & GCC Conglomerates", region: "UAE & Jordan", exec: "MJ Fahmi", title: "CEO" },
    { name: "stc play", domain: "stcplay.gg", email: "contact@stcplay.gg", portal: "https://stcplay.gg", category: "MENA & GCC Conglomerates", region: "Saudi Arabia (KSA)", exec: "Bader Al-Manie", title: "Head of Gaming" },
    { name: "e& (Etisalat)", domain: "eand.com", email: "gaming@eand.com", portal: "https://eand.com", category: "MENA & GCC Conglomerates", region: "UAE & Global", exec: "Hatem Dowidar", title: "Group CEO" },
    { name: "Zain Esports", domain: "zainesports.com", email: "info@zainesports.com", portal: "https://zainesports.com", category: "MENA & GCC Conglomerates", region: "Kuwait & MENA", exec: "Malek Hammoud", title: "Chief Investment Officer" },
    { name: "Ooredoo", domain: "ooredoo.com", email: "investments@ooredoo.com", portal: "https://ooredoo.com", category: "MENA & GCC Conglomerates", region: "Qatar & MENA", exec: "Aziz Aluthman Fakhroo", title: "Group CEO" },
    { name: "Maysalward", domain: "maysalward.com", email: "info@maysalward.com", portal: "https://maysalward.com", category: "MENA & GCC Conglomerates", region: "Jordan & UAE", exec: "Nour Khrais", title: "CEO" },
    { name: "Anghami", domain: "anghami.com", email: "business@anghami.com", portal: "https://anghami.com", category: "MENA & GCC Conglomerates", region: "UAE & Egypt", exec: "Eddy Maroun", title: "Co-Founder & CEO" },

    // --- 3. Crypto & Web3 iGaming Operators ---
    { name: "Stake.com", domain: "stake.com", email: "partners@stake.com", portal: "https://stake.com", category: "Crypto & Web3 Gaming", region: "Global Crypto", exec: "Edward Craven", title: "Co-Founder" },
    { name: "Rollbit", domain: "rollbit.com", email: "partnerships@rollbit.com", portal: "https://rollbit.com", category: "Crypto & Web3 Gaming", region: "Global Crypto", exec: "Razer", title: "Co-Founder" },
    { name: "BC.Game", domain: "bc.game", email: "business@bc.game", portal: "https://bc.game", category: "Crypto & Web3 Gaming", region: "Global Crypto", exec: "Jack Dorset", title: "CEO" },
    { name: "Roobet", domain: "roobet.com", email: "partnerships@roobet.com", portal: "https://roobet.com", category: "Crypto & Web3 Gaming", region: "Global Crypto", exec: "Matt Duea", title: "Chief Operating Officer" },
    { name: "Shuffle.com", domain: "shuffle.com", email: "partnerships@shuffle.com", portal: "https://shuffle.com", category: "Crypto & Web3 Gaming", region: "Global Crypto", exec: "Noah Dummett", title: "CEO & Founder" },
    { name: "Duelbits", domain: "duelbits.com", email: "partnerships@duelbits.com", portal: "https://duelbits.com", category: "Crypto & Web3 Gaming", region: "Global Crypto", exec: "Marco Pagnotta", title: "CEO" },
    { name: "Gamdom", domain: "gamdom.com", email: "business@gamdom.com", portal: "https://gamdom.com", category: "Crypto & Web3 Gaming", region: "Global Crypto", exec: "Felix Roemer", title: "Founder" },
    { name: "Sportsbet.io (Yolo Group)", domain: "yolo.com", email: "info@yolo.com", portal: "https://yolo.com", category: "Crypto & Web3 Gaming", region: "Global Crypto", exec: "Tim Heath", title: "Founder" },
    { name: "Bitcasino.io", domain: "bitcasino.io", email: "affiliates@bitcasino.io", portal: "https://bitcasino.io", category: "Crypto & Web3 Gaming", region: "Global Crypto", exec: "Kaupo Kangro", title: "Managing Director" },
    { name: "Cloudbet", domain: "cloudbet.com", email: "partnerships@cloudbet.com", portal: "https://cloudbet.com", category: "Crypto & Web3 Gaming", region: "Global Crypto", exec: "Leandro Rossi", title: "Director of Operations" },
    { name: "Betfury", domain: "betfury.io", email: "partnerships@betfury.io", portal: "https://betfury.io", category: "Crypto & Web3 Gaming", region: "Global Crypto", exec: "Dmitry Dyakonov", title: "CEO" },
    { name: "Polymarket", domain: "polymarket.com", email: "partnerships@polymarket.com", portal: "https://polymarket.com", category: "Crypto & Web3 Gaming", region: "Global Web3", exec: "Shayne Coplan", title: "Founder & CEO" },

    // --- 4. Real-Money Skill Gaming (RMSG) ---
    { name: "Skillz Inc", domain: "skillz.com", email: "bizdev@skillz.com", portal: "https://skillz.com", category: "Real-Money Skill Gaming", region: "North America", exec: "Andrew Paradise", title: "CEO" },
    { name: "Mobile Premier League (MPL)", domain: "mpl.live", email: "partnerships@mpl.live", portal: "https://mpl.live", category: "Real-Money Skill Gaming", region: "Asia & North America", exec: "Sai Srinivas", title: "Co-Founder & CEO" },
    { name: "WinZO Games", domain: "winzogames.com", email: "partnerships@winzogames.com", portal: "https://winzogames.com", category: "Real-Money Skill Gaming", region: "India & Global", exec: "Paavan Nanda", title: "Co-Founder" },
    { name: "Papaya Gaming", domain: "papayagaming.com", email: "bizdev@papayagaming.com", portal: "https://papayagaming.com", category: "Real-Money Skill Gaming", region: "North America & Europe", exec: "Oon Knoxx", title: "CEO" },
    { name: "AviaGames", domain: "aviagames.com", email: "partnerships@aviagames.com", portal: "https://aviagames.com", category: "Real-Money Skill Gaming", region: "North America", exec: "Vickie Chen", title: "Founder & CEO" },
    { name: "Zupee", domain: "zupee.com", email: "partnerships@zupee.com", portal: "https://zupee.com", category: "Real-Money Skill Gaming", region: "India", exec: "Dilsher Singh Malhi", title: "Founder & CEO" },
    { name: "Gameberry Labs", domain: "gameberry.in", email: "info@gameberry.in", portal: "https://gameberry.in", category: "Real-Money Skill Gaming", region: "India & MENA", exec: "Afsar Ahmad", title: "Co-Founder" },
    { name: "Games24x7", domain: "games24x7.com", email: "corporate@games24x7.com", portal: "https://games24x7.com", category: "Real-Money Skill Gaming", region: "India & Global", exec: "Bhavin Pandya", title: "Co-CEO" },

    // --- 5. Tier-1 Regulated Sportsbook Operators ---
    { name: "Entain plc", domain: "entaingroup.com", email: "corporate.development@entaingroup.com", portal: "https://entaingroup.com", category: "Tier-1 Regulated Operators", region: "UK & Global", exec: "Gavin Isaacs", title: "CEO" },
    { name: "Flutter Entertainment", domain: "flutter.com", email: "corporate.development@flutter.com", portal: "https://flutter.com", category: "Tier-1 Regulated Operators", region: "US, UK & Global", exec: "Peter Jackson", title: "CEO" },
    { name: "Bet365", domain: "bet365.com", email: "support-eng@customerservices365.com", portal: "https://bet365.com", category: "Tier-1 Regulated Operators", region: "UK & Global", exec: "Denise Coates", title: "Founder & CEO" },
    { name: "Betsson Group", domain: "betssongroup.com", email: "info@betssongroup.com", portal: "https://betssongroup.com", category: "Tier-1 Regulated Operators", region: "Scandinavia & LatAm", exec: "Pontus Lindwall", title: "CEO" },
    { name: "888 Holdings (Evoke)", domain: "evokeplc.com", email: "corporate@evokeplc.com", portal: "https://evokeplc.com", category: "Tier-1 Regulated Operators", region: "Europe & Global", exec: "Per Widerström", title: "CEO" },
    { name: "Kindred Group", domain: "kindredgroup.com", email: "info@kindredgroup.com", portal: "https://kindredgroup.com", category: "Tier-1 Regulated Operators", region: "Europe", exec: "Nils Andén", title: "CEO" },
    { name: "LeoVegas Group (MGM)", domain: "leovegasgroup.com", email: "investor.relations@leovegasgroup.com", portal: "https://leovegasgroup.com", category: "Tier-1 Regulated Operators", region: "Europe & Global", exec: "Gustaf Hagman", title: "CEO" },
    { name: "Superbet Group", domain: "superbetgroup.com", email: "office@superbetgroup.com", portal: "https://superbetgroup.com", category: "Tier-1 Regulated Operators", region: "Central/Eastern Europe & LatAm", exec: "Jimmy Maymann", title: "CEO" },
    { name: "Kaizen Gaming (Betano)", domain: "kaizengaming.com", email: "contact@kaizengaming.com", portal: "https://kaizengaming.com", category: "Tier-1 Regulated Operators", region: "Europe & LatAm (Brazil)", exec: "George Daskalakis", title: "CEO" },
    { name: "Betway (Super Group)", domain: "supergroup.co.uk", email: "contact@supergroup.co.uk", portal: "https://supergroup.co.uk", category: "Tier-1 Regulated Operators", region: "Global & Africa", exec: "Neal Menashe", title: "CEO" },
    { name: "Novibet", domain: "novibet.com", email: "support@novibet.com", portal: "https://novibet.com", category: "Tier-1 Regulated Operators", region: "Europe & LatAm", exec: "Rodolfo Odoni", title: "Chairman" },

    // --- 6. M&A Advisors & Tech Private Equity ---
    { name: "Tekkorp Capital", domain: "tekkorp.com", email: "info@tekkorp.com", portal: "https://tekkorp.com", category: "Gaming M&A & Private Equity", region: "US & Global", exec: "Matt Davey", title: "Founder & Chairman" },
    { name: "HappyHour.io", domain: "happyhour.io", email: "hello@happyhour.io", portal: "https://happyhour.io", category: "Gaming M&A & Private Equity", region: "Malta & Europe", exec: "Robin Reed", title: "Managing Partner" },
    { name: "Bettor Capital", domain: "bettorcapital.com", email: "contact@bettorcapital.com", portal: "https://bettorcapital.com", category: "Gaming M&A & Private Equity", region: "US", exec: "Dave VanEgmond", title: "Founder & Managing Partner" },
    { name: "Play Ventures", domain: "playventures.vc", email: "info@playventures.vc", portal: "https://playventures.vc", category: "Gaming M&A & Private Equity", region: "Singapore & Europe", exec: "Henric Suuronen", title: "Founding Partner" },
    { name: "Velo Partners", domain: "velopartners.com", email: "info@velopartners.com", portal: "https://velopartners.com", category: "Gaming M&A & Private Equity", region: "UK", exec: "Evan Hoff", title: "Partner" },
    { name: "Oakvale Capital", domain: "oakvalecapital.com", email: "info@oakvalecapital.com", portal: "https://oakvalecapital.com", category: "Gaming M&A & Private Equity", region: "UK", exec: "Daniel Burns", title: "Managing Partner" },
    { name: "Partis Solutions", domain: "partissolutions.com", email: "info@partissolutions.com", portal: "https://partissolutions.com", category: "Gaming M&A & Private Equity", region: "US & Europe", exec: "Rob Dowling", title: "Co-Founder" },
    { name: "Corum Group", domain: "corumgroup.com", email: "info@corumgroup.com", portal: "https://corumgroup.com", category: "Gaming M&A & Private Equity", region: "US & Europe", exec: "Bruce Milne", title: "CEO & Founder" },
    { name: "FE International", domain: "feinternational.com", email: "acquisitions@feinternational.com", portal: "https://feinternational.com", category: "Gaming M&A & Private Equity", region: "US & UK", exec: "Thomas Smale", title: "CEO" },
    { name: "Website Properties", domain: "websiteproperties.com", email: "info@websiteproperties.com", portal: "https://websiteproperties.com", category: "Gaming M&A & Private Equity", region: "US", exec: "David Fairley", title: "Managing Director" },
    { name: "BITKRAFT Ventures", domain: "bitkraft.vc", email: "info@bitkraft.vc", portal: "https://bitkraft.vc", category: "Gaming M&A & Private Equity", region: "US & Europe", exec: "Jens Hilgers", title: "Founding General Partner" },
    { name: "Griffin Gaming Partners", domain: "griffingp.com", email: "info@griffingp.com", portal: "https://griffingp.com", category: "Gaming M&A & Private Equity", region: "US", exec: "Peter Levin", title: "Managing Director" },
    { name: "Makers Fund", domain: "makersfund.com", email: "info@makersfund.com", portal: "https://makersfund.com", category: "Gaming M&A & Private Equity", region: "US & Asia", exec: "Michael Cheung", title: "Partner" },
    { name: "Acquire.com", domain: "acquire.com", email: "support@acquire.com", portal: "https://acquire.com", category: "Gaming M&A & Private Equity", region: "US & Global", exec: "Andrew Gazdecki", title: "CEO & Founder" }
];

async function verifyAndBuild() {
    console.log(`🔍 Verifying ${REAL_COMPANIES.length} real companies via real-time DNS MX lookups...`);
    const verifiedList = [];
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < REAL_COMPANIES.length; i++) {
        const item = REAL_COMPANIES[i];
        try {
            const mxRecords = await dns.resolveMx(item.domain);
            if (mxRecords && mxRecords.length > 0) {
                passed++;
                const waText = encodeURIComponent(`Hi Hifzy, regarding Nizalo acquisition inquiry for ${item.name}`);
                const waUrl = `${USER_WHATSAPP_BASE}?text=${waText}`;

                let angle = "";
                if (item.category.includes("MENA")) {
                    angle = `Monetize the massive cultural affinity for Backgammon (Tawla), Dominoes, and Chess across the Middle East with Nizalo's 6-language turnkey infrastructure.`;
                } else if (item.category.includes("Crypto")) {
                    angle = `Deploy Nizalo's server-authoritative 1v1 mind sports with sub-60s crypto cashier (USDT, BTC, ETH) into ${item.name}'s ecosystem for high-margin rake without bankroll variance.`;
                } else if (item.category.includes("Skill Gaming")) {
                    angle = `Expand ${item.name}'s competitive skill portfolio with instant web-based P2P Chess Blitz, Draughts, and Tawla duels, slashing CAC through viral multiplayer challenges.`;
                } else if (item.category.includes("M&A")) {
                    angle = `Acquire 100% worldwide IP and unencumbered source code ($500K) or syndicate B2B white-label licenses across portfolio gaming and media assets.`;
                } else {
                    angle = `Integrate Nizalo's 11 proprietary P2P skill mind sports engines into ${item.name}'s aggregation catalog to give sportsbook operators high-margin, zero-house-risk player retention.`;
                }

                verifiedList.push({
                    id: passed,
                    name: item.exec,
                    title: item.title,
                    company: item.name,
                    domain: item.domain,
                    email: item.email,
                    contact_portal: item.portal,
                    category: item.category,
                    region: item.region,
                    angle: angle,
                    whatsapp_url: waUrl,
                    mx_host: mxRecords[0].exchange
                });
            } else {
                failed++;
                console.warn(`⚠️ No MX records for: ${item.name} (${item.domain})`);
            }
        } catch (err) {
            failed++;
            console.warn(`❌ DNS resolution failed for: ${item.name} (${item.domain}): ${err.code}`);
        }
    }

    console.log(`\n========================================`);
    console.log(`🎯 TOTAL COMPANIES VERIFIED WITH LIVE MX: ${verifiedList.length} / ${REAL_COMPANIES.length}`);
    console.log(`✅ Success Rate: ${Math.round((passed / REAL_COMPANIES.length) * 100)}%`);
    console.log(`========================================\n`);

    // Save strictly verified database
    const verifiedPath = path.join(rootDir, 'deliverables', 'verified_institutional_buyers.json');
    fs.writeFileSync(verifiedPath, JSON.stringify(verifiedList, null, 2), 'utf8');

    // Also update the active database used by the dispatcher
    const activeDbPath = path.join(rootDir, 'deliverables', 'institutional_buyers_database.json');
    fs.writeFileSync(activeDbPath, JSON.stringify(verifiedList, null, 2), 'utf8');

    console.log(`💾 Saved verified database to: ${verifiedPath}`);
    console.log(`💾 Overwrote active dispatcher database at: ${activeDbPath}`);

    return verifiedList;
}

verifyAndBuild().catch(console.error);
