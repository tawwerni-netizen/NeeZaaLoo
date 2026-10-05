import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const USER_PHONE = "+201069999557";
const USER_WHATSAPP_BASE = "https://wa.me/201069999557";

const PORTALS_DATA = [
    // 1. Tier-1 B2B Platforms & Aggregators (30)
    { id: 1, company: "EveryMatrix", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://everymatrix.com/contact-us/", exec: "Stian Hornsletten (CCO)", specificValue: "Integrate 11 proprietary P2P skill mind sports into CasinoEngine to give 300+ sportsbook operators zero-house-risk player retention." },
    { id: 2, company: "SOFTSWISS", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://softswiss.com/contact-us/", exec: "Andrey Starovoitov (Co-CEO)", specificValue: "Direct integration of server-authoritative P2P duels into SOFTSWISS Game Aggregator with native crypto cashier (USDT/BTC) and sub-60s payouts." },
    { id: 3, company: "Digitain", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://digitain.com/contact-us/", exec: "Ani Mkrtchyan (CSO)", specificValue: "Enrich Centrivo PAM and Fast Games catalog with proprietary 1v1 mind sports duels (Chess Blitz, Backgammon, Dominoes)." },
    { id: 4, company: "BetConstruct", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://betconstruct.com", exec: "Gor Mnatsakanyan (Regional Dir)", specificValue: "Add Nizalo's turnkey tournament infrastructure with zero house risk into Spring Platform ecosystem." },
    { id: 5, company: "Pragmatic Play", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://pragmaticplay.com/en/contact-us/", exec: "Julian Jarvis (CEO)", specificValue: "Strategic acquisition or content distribution partnership to add non-gambling skill gaming engines to Pragmatic's global operator network." },
    { id: 6, company: "Playtech", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://playtech.com/contact", exec: "Mor Weizer (CEO)", specificValue: "Bolt-on Nizalo's Next.js/Node.js tournament microservices into Playtech ONE omni-channel platform." },
    { id: 7, company: "Evolution Gaming", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://evolution.com", exec: "Martin Carlesund (Group CEO)", specificValue: "Full IP acquisition ($500K) to expand beyond live casino into pure digital P2P strategic skill duels." },
    { id: 8, company: "Bragg Gaming Group", category: "iGaming Aggregators & B2B", region: "North America & Europe", portal: "https://bragg.group", exec: "Matevž Mazij (CEO)", specificValue: "Aggregate Nizalo's 11 engines through Bragg HUB for US and European regulated operators." },
    { id: 9, company: "SkillOnNet", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://skillonnet.com", exec: "Michael Golembo (Sales Dir)", specificValue: "Deploy Nizalo's skill games across SkillOnNet's 40+ proprietary casino brands (PlayOJO, Slingo) to lower acquisition costs." },
    { id: 10, company: "Altenar", category: "iGaming Aggregators & B2B", region: "Europe & LatAm", portal: "https://altenar.com/contact/", exec: "Stanislav Silin (CEO)", specificValue: "Offer turnkey skill gaming retainers to Altenar sportsbook operators during sports off-seasons." },
    { id: 11, company: "Soft2Bet", category: "iGaming Aggregators & B2B", region: "Europe & LatAm", portal: "https://soft2bet.com", exec: "Uri Poliavich (CEO)", specificValue: "Syndicate Nizalo's gamified tournament mechanics into Soft2Bet's Motivational Engineering Gaming Application (MEGA)." },
    { id: 12, company: "GiG Software PLC", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://gig.com/contact-us/", exec: "Richard Carter (CEO)", specificValue: "License or buyout Nizalo's modular P2P architecture for CoreX platform." },
    { id: 13, company: "Endorphina", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://endorphina.com", exec: "Kirill Miroshnichenko (CCO)", specificValue: "Diversify slot-only portfolio into high-margin real-money skill gaming infrastructure." },
    { id: 14, company: "Wazdan", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://wazdan.com", exec: "Andrzej Hyla (CCO)", specificValue: "Cross-promote Nizalo's 11 competitive engines to Wazdan's 1,500+ integrated online casinos." },
    { id: 15, company: "SoftGamings", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://softgamings.com", exec: "Irina Semyonova (Partnerships)", specificValue: "Add Nizalo via unified API into SoftGamings aggregation platform reaching 500+ operators." },
    { id: 16, company: "NuxGame", category: "iGaming Aggregators & B2B", region: "Global", portal: "https://nuxgame.com", exec: "Denis Kosinsky (COO)", specificValue: "Turnkey white-label integration of Backgammon and Dominoes into NuxGame crypto and fiat solutions." },
    { id: 17, company: "Upgaming", category: "iGaming Aggregators & B2B", region: "Europe & LatAm", portal: "https://upgaming.com", exec: "Tornike Tvauri (CEO)", specificValue: "Incorporate fast skill duels into Upgaming's mini-games and sportsbook offerings." },
    { id: 18, company: "Sportradar", category: "iGaming Aggregators & B2B", region: "Global", portal: "https://sportradar.com/contact-us/", exec: "Carsten Koerl (CEO)", specificValue: "Deliver non-event-dependent skill competitions (Chess Blitz, Math) for sports betting platforms." },
    { id: 19, company: "Kambi Group", category: "iGaming Aggregators & B2B", region: "Global", portal: "https://kambi.com/contact-us/", exec: "Kristian Nylén (CEO)", specificValue: "Integrate peer-to-peer tournament rails alongside premium sportsbook solutions." },
    { id: 20, company: "Aspire Global", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://aspireglobal.com", exec: "Tsachi Maimon (CEO)", specificValue: "Expand Aristocrat Interactive / Aspire Global white-label turnkey offerings with 11 in-house engines." },
    { id: 21, company: "Pronet Gaming", category: "iGaming Aggregators & B2B", region: "Emerging Markets & LatAm", portal: "https://pronetgaming.com", exec: "Alex Leese (CEO)", specificValue: "Target high-growth African and LatAm markets with low-bandwidth, mobile-optimized P2P duels." },
    { id: 22, company: "Pariplay", category: "iGaming Aggregators & B2B", region: "Global", portal: "https://pariplayltd.com", exec: "Adrian Bailey (Managing Dir)", specificValue: "Distribute Nizalo's engines globally via Fusion aggregation platform." },
    { id: 23, company: "Light & Wonder", category: "iGaming Aggregators & B2B", region: "North America & Global", portal: "https://explore.lnw.com/contact-us/", exec: "Matt Wilson (CEO)", specificValue: "Acquire IP ($500K) to enhance OpenGaming ecosystem with proprietary server-authoritative skill games." },
    { id: 24, company: "BGaming", category: "iGaming Aggregators & B2B", region: "Europe & Global", portal: "https://bgaming.com/contact-us/", exec: "Marina Ostrovtsova (CEO)", specificValue: "Co-brand or acquire Nizalo's P2P mind sports to expand beyond casual crypto slots." },
    { id: 25, company: "BtoBet", category: "iGaming Aggregators & B2B", region: "Europe, LatAm, Africa", portal: "https://btobet.com", exec: "Dima Reiderman (Managing Dir)", specificValue: "Equip Neuron 3 platform with community-driven skill tournaments and instant cashouts." },
    { id: 26, company: "Slotegrator", category: "iGaming Aggregators & B2B", region: "Global", portal: "https://slotegrator.pro", exec: "Yana Khaidukova (Managing Dir)", specificValue: "Onboard Nizalo via APIgrator to supply operators across Asia, CIS, and LatAm." },
    { id: 27, company: "Singular", category: "iGaming Aggregators & B2B", region: "Europe", portal: "https://singular.uk", exec: "George Shamugia (CEO)", specificValue: "Leverage Nizalo's modular microservices architecture within Flutter Entertainment's tech division." },
    { id: 28, company: "Spribe", category: "iGaming Aggregators & B2B", region: "Global", portal: "https://spribe.co", exec: "David Natroshvili (Managing Partner)", specificValue: "Synergize Aviator's turbo-game audience with competitive 1v1 mind sports (Backgammon, Dominoes)." },
    { id: 29, company: "Galaxsys", category: "iGaming Aggregators & B2B", region: "Global", portal: "https://galaxsys.co", exec: "Hayk Sargsyan (CEO)", specificValue: "Acquire full IP or license to reinforce fast and skill gaming leadership worldwide." },
    { id: 30, company: "Turbo Games", category: "iGaming Aggregators & B2B", region: "Global", portal: "https://turbogames.io", exec: "Vadim Potapenko (Head of Sales)", specificValue: "Cross-license crash and turbo mechanics with Nizalo's multiplayer tournament lobby." },

    // 2. Game Studios & Content Providers (20)
    { id: 31, company: "Hacksaw Gaming", category: "Game Studios & Content", region: "Europe & Global", portal: "https://hacksawgaming.com", exec: "Marcus Cordes (CEO)", specificValue: "Expand from scratchcards and high-volatility slots into real-money player-vs-player strategy." },
    { id: 32, company: "Nolimit City", category: "Game Studios & Content", region: "Europe & Global", portal: "https://nolimitcity.com", exec: "Jonas Tegman (Co-Founder)", specificValue: "Acquire turnkey skill mechanics to tap into emerging non-gambling skill gaming jurisdictions." },
    { id: 33, company: "Push Gaming", category: "Game Studios & Content", region: "Europe & Global", portal: "https://pushgaming.com", exec: "James Marshall (CEO)", specificValue: "Incorporate Nizalo's server-side chess and checkers logic into new interactive formats." },
    { id: 34, company: "Relax Gaming", category: "Game Studios & Content", region: "Europe & Global", portal: "https://relax-gaming.com", exec: "Simon Hammon (CEO)", specificValue: "Distribute via Powered By Relax program to 700+ connected online casinos." },
    { id: 35, company: "Yggdrasil Gaming", category: "Game Studios & Content", region: "Europe & Global", portal: "https://yggdrasilgaming.com", exec: "James Curwen (CEO)", specificValue: "Scale Nizalo's 11 engines using Yggdrasil's YG Masters GDM technology." },
    { id: 36, company: "Evoplay", category: "Game Studios & Content", region: "Europe & Global", portal: "https://evoplay.games", exec: "Ivan Kravchuk (CEO)", specificValue: "Combine Evoplay's 3D/web gaming engine experience with Nizalo's real-money tournament ledger." },
    { id: 37, company: "Playson", category: "Game Studios & Content", region: "Europe & Global", portal: "https://playson.com", exec: "Alex Ivshin (CEO)", specificValue: "Add P2P competitive tournaments to Playson's promotional mechanics suite." },
    { id: 38, company: "Spinomenal", category: "Game Studios & Content", region: "Global", portal: "https://spinomenal.com", exec: "Lior Shvartz (CEO)", specificValue: "Deploy lightweight, high-speed skill engines to low-bandwidth mobile gaming markets." },
    { id: 39, company: "Amusnet", category: "Game Studios & Content", region: "Europe & Global", portal: "https://amusnet.com", exec: "Ivo Georgiev (CEO)", specificValue: "Diversify legacy casino content into modern web-based strategy and mind sports." },
    { id: 40, company: "Greentube (Novomatic)", category: "Game Studios & Content", region: "Europe & Global", portal: "https://greentube.com", exec: "Michael Bauer (CGO)", specificValue: "Acquire IP to strengthen Greentube's skill gaming and classic board games division." },
    { id: 41, company: "Synot Games", category: "Game Studios & Content", region: "Europe", portal: "https://synotgames.com", exec: "Ivan Kodaj (CEO)", specificValue: "Bundle Nizalo's 11 engines for Central European land-based and online operators." },
    { id: 42, company: "Tom Horn Gaming", category: "Game Studios & Content", region: "Europe", portal: "https://tomhorngaming.com", exec: "Ondrej Lapides (CEO)", specificValue: "Integrate server-authoritative tournament duels into Tom Horn's modular gaming ecosystem." },
    { id: 43, company: "Belatra Games", category: "Game Studios & Content", region: "Global & LatAm", portal: "https://belatragames.com", exec: "Kateryna Goy (Head of BD)", specificValue: "Capitalize on Latin American demand for multiplayer Dominoes and Checkers." },
    { id: 44, company: "Betsoft Gaming", category: "Game Studios & Content", region: "Global", portal: "https://betsoft.com", exec: "Clare Bowring (Commercial Dir)", specificValue: "Add competitive mind sports to Betsoft's global multi-currency operator portfolio." },
    { id: 45, company: "Fugaso", category: "Game Studios & Content", region: "Europe", portal: "https://fugaso.com", exec: "Niko Mazger (CEO)", specificValue: "White-label deployment of Nizalo's 1v1 duels with custom cashier rails." },
    { id: 46, company: "Mancala Gaming", category: "Game Studios & Content", region: "Global", portal: "https://mancalagaming.com", exec: "Nikita Gorshkov (CEO)", specificValue: "Engage Gen-Z and millennial players through skill-based multiplayer competition." },
    { id: 47, company: "Red Rake Gaming", category: "Game Studios & Content", region: "Europe & LatAm", portal: "https://redrakegaming.com", exec: "Carlos Sánchez (Managing Dir)", specificValue: "Expand Spanish and LatAm footprint with authentic P2P Dominoes and Chess." },
    { id: 48, company: "Stakelogic", category: "Game Studios & Content", region: "Europe", portal: "https://stakelogic.com", exec: "Stephan van den Oetelaar (CEO)", specificValue: "Integrate live tournament leaderboards and instant multiplayer matching logic." },
    { id: 49, company: "Swintt", category: "Game Studios & Content", region: "Europe", portal: "https://swintt.com", exec: "David Mann (CEO)", specificValue: "Combine SwinttLive gamification with Nizalo's P2P skill games for high-margin operator rake." },
    { id: 50, company: "1X2 Network", category: "Game Studios & Content", region: "Europe", portal: "https://1x2network.com", exec: "Kevin Reid (CEO)", specificValue: "Scale 1X2 Network's 3rd party distribution with 11 in-house proprietary engines." },

    // 3. MENA & GCC Gaming, Media & Telecom Giants (15)
    { id: 51, company: "Savvy Games Group", category: "MENA & GCC Conglomerates", region: "Saudi Arabia (KSA)", portal: "https://savvygames.com", exec: "Brian Ward (CEO)", specificValue: "Acquire 100% IP ($500K) to anchor national skill gaming and esports infrastructure under Saudi Vision 2030." },
    { id: 52, company: "Yalla Group (Yalla Ludo)", category: "MENA & GCC Conglomerates", region: "UAE & MENA", portal: "https://yalla.com", exec: "Tao Yang (Chairman & CEO)", specificValue: "Acquire real-money tournament infrastructure to complement Yalla Ludo's $300M+ MENA board gaming ecosystem." },
    { id: 53, company: "MBC Group (Shahid)", category: "MENA & GCC Conglomerates", region: "MENA Region", portal: "https://mbc.net", exec: "Sam Barnett (CEO)", specificValue: "Integrate casual skill gaming duels (Tawla, Chess) into Shahid streaming platform to boost subscriber engagement." },
    { id: 54, company: "Jawaker (Stillfront)", category: "MENA & GCC Conglomerates", region: "Jordan & UAE", portal: "https://jawaker.com", exec: "Mohamad Haj-Hasan (CEO)", specificValue: "Bolt-on server-authoritative real-money tournament rails to Jawaker's massive card and board game user base." },
    { id: 55, company: "Tamatem Games", category: "MENA & GCC Conglomerates", region: "Jordan & Saudi Arabia", portal: "https://tamatem.co", exec: "Hussam Hammo (CEO & Founder)", specificValue: "Publish and operate Nizalo across GCC app stores with pre-built 6-language Arabic-native white-label." },
    { id: 56, company: "Sandsoft Games", category: "MENA & GCC Conglomerates", region: "Saudi Arabia & UAE", portal: "https://sandsoft.com", exec: "David Fernandez (CEO)", specificValue: "Acquire turnkey code to accelerate Sandsoft's MENA first-party game publishing pipeline." },
    { id: 57, company: "Babil Games", category: "MENA & GCC Conglomerates", region: "UAE & Jordan", portal: "https://babilgames.com", exec: "MJ Fahmi (CEO)", specificValue: "Monetize multiplayer strategy players via cash tournaments with zero house risk." },
    { id: 58, company: "stc play", category: "MENA & GCC Conglomerates", region: "Saudi Arabia (KSA)", portal: "https://stcplay.gg", exec: "Bader Al-Manie (Head of Gaming)", specificValue: "Embed browser-based competitive mind sports duels directly into stc play ecosystem for millions of subscribers." },
    { id: 59, company: "e& (Etisalat Arena)", category: "MENA & GCC Conglomerates", region: "UAE & Global", portal: "https://eand.com", exec: "Hatem Dowidar (Group CEO)", specificValue: "Launch telco-integrated P2P skill gaming tournaments with direct carrier billing (DCB)." },
    { id: 60, company: "Zain Esports", category: "MENA & GCC Conglomerates", region: "Kuwait & MENA", portal: "https://zainesports.com", exec: "Malek Hammoud (Chief Inv Officer)", specificValue: "Host national esports tournaments in Chess Blitz and Tawla powered by Nizalo's automated brackets." },
    { id: 61, company: "Ooredoo", category: "MENA & GCC Conglomerates", region: "Qatar & MENA", portal: "https://ooredoo.com", exec: "Aziz Aluthman Fakhroo (Group CEO)", specificValue: "Deploy web-based casual esports for mobile subscribers with zero app store rev-share." },
    { id: 62, company: "Maysalward", category: "MENA & GCC Conglomerates", region: "Jordan & UAE", portal: "https://maysalward.com", exec: "Nour Khrais (CEO)", specificValue: "Strategic acquisition of web multiplayer codebase for regional operator licensing." },
    { id: 63, company: "Anghami", category: "MENA & GCC Conglomerates", region: "UAE & Egypt", portal: "https://anghami.com", exec: "Eddy Maroun (Co-Founder & CEO)", specificValue: "Integrate quick casual gaming duels into Anghami's super-app ecosystem." },
    { id: 64, company: "Noon Technologies", category: "MENA & GCC Conglomerates", region: "UAE & Saudi Arabia", portal: "https://noon.com", exec: "Faraz Khalid (CEO)", specificValue: "Incorporate gamified rewards and P2P mind sports challenges into consumer super-app." },
    { id: 65, company: "Careem Technologies", category: "MENA & GCC Conglomerates", region: "UAE & MENA", portal: "https://careem.com", exec: "Mudassir Sheikha (CEO)", specificValue: "Gamify Careem Pay wallet balance with competitive P2P skill games and cash tournaments." },

    // 4. Crypto, Web3 & High-Volume iGaming Operators (15)
    { id: 66, company: "Stake.com", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://stake.com", exec: "Edward Craven (Co-Founder)", specificValue: "Integrate Nizalo's 11 engines as 'Stake Originals - P2P' with instant crypto cashier (USDT, BTC, ETH) and automated rake." },
    { id: 67, company: "Rollbit", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://rollbit.com", exec: "Razer (Co-Founder)", specificValue: "Introduce genuine P2P skill duels (Chess, Backgammon) with RLB token burns and high-margin operator rake." },
    { id: 68, company: "BC.Game", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://bc.game", exec: "Jack Dorset (CEO)", specificValue: "Deploy Nizalo's multiplayer lobby to BC.Game's 3M+ active crypto users with provably fair server authority." },
    { id: 69, company: "Roobet", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://roobet.com", exec: "Matt Duea (COO)", specificValue: "Expand beyond slots and crash into skill-based competitive duels with sub-60s payouts." },
    { id: 70, company: "Shuffle.com", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://shuffle.com", exec: "Noah Dummett (CEO & Founder)", specificValue: "Acquire IP or license to differentiate Shuffle's fast-growing crypto casino with exclusive 1v1 mind sports." },
    { id: 71, company: "Duelbits", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://duelbits.com", exec: "Marco Pagnotta (CEO)", specificValue: "Incorporate native skill duels matching Duelbits' core brand identity." },
    { id: 72, company: "Gamdom", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://gamdom.com", exec: "Felix Roemer (Founder)", specificValue: "Attract esports bettors with real-money tactical chess, checkers, and connect four duels." },
    { id: 73, company: "Sportsbet.io (Yolo Group)", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://yolo.com", exec: "Tim Heath (Founder)", specificValue: "Strategic acquisition ($500K) to plug into Yolo Group's fintech and crypto gaming portfolio." },
    { id: 74, company: "Bitcasino.io", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://bitcasino.io", exec: "Kaupo Kangro (Managing Dir)", specificValue: "Enhance VIP player retention with high-stakes P2P backgammon and chess tournaments." },
    { id: 75, company: "Cloudbet", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://cloudbet.com", exec: "Leandro Rossi (Operations Dir)", specificValue: "Offer regulated-feel skill games with instant cryptocurrency settlements." },
    { id: 76, company: "Betfury", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://betfury.io", exec: "Dmitry Dyakonov (CEO)", specificValue: "Integrate BFG staking rewards with Nizalo's tournament prize pool distribution." },
    { id: 77, company: "Polymarket", category: "Crypto & Web3 Gaming", region: "Global Web3", portal: "https://polymarket.com", exec: "Shayne Coplan (Founder & CEO)", specificValue: "Explore deterministic 1v1 strategy duels as a complementary engagement pillar to prediction markets." },
    { id: 78, company: "Rainbet", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://rainbet.com", exec: "Business Dev Lead", specificValue: "Turnkey integration of provably fair skill games to monetize high-frequency crypto depositors." },
    { id: 79, company: "CSGORoll", category: "Crypto & Web3 Gaming", region: "Global Esports", portal: "https://csgoroll.com", exec: "Partnerships Team", specificValue: "Leverage Nizalo's instant 1v1 duel format to engage CS2 and skin-trading gaming demographics." },
    { id: 80, company: "500 Casino", category: "Crypto & Web3 Gaming", region: "Global Crypto", portal: "https://500.casino", exec: "Corporate Dev Team", specificValue: "Add P2P board game duels with multi-crypto cashier rails and zero house risk." },

    // 5. Real-Money Skill Gaming (RMSG) & Esports Studios (10)
    { id: 81, company: "Skillz Inc", category: "Real-Money Skill Gaming", region: "North America", portal: "https://skillz.com", exec: "Andrew Paradise (CEO)", specificValue: "Acquire browser-based Next.js/Node.js tournament engine to bypass native app store 30% fees." },
    { id: 82, company: "Mobile Premier League (MPL)", category: "Real-Money Skill Gaming", region: "Asia & North America", portal: "https://mpl.live", exec: "Sai Srinivas (Co-Founder & CEO)", specificValue: "Syndicate Nizalo's 11 engines into MPL's global expansion footprint in the US and Europe." },
    { id: 83, company: "WinZO Games", category: "Real-Money Skill Gaming", region: "India & Global", portal: "https://winzogames.com", exec: "Paavan Nanda (Co-Founder)", specificValue: "Deploy web-based mind sports duels to diversify beyond regional vernacular games." },
    { id: 84, company: "Papaya Gaming", category: "Real-Money Skill Gaming", region: "North America & Europe", portal: "https://papayagaming.com", exec: "Oon Knoxx (CEO)", specificValue: "Acquire full IP ($500K) to enter synchronous real-time board gaming without rebuilding engine math." },
    { id: 85, company: "AviaGames", category: "Real-Money Skill Gaming", region: "North America", portal: "https://aviagames.com", exec: "Vickie Chen (Founder & CEO)", specificValue: "Integrate server-authoritative anti-cheat and multiplayer web infrastructure." },
    { id: 86, company: "Zupee", category: "Real-Money Skill Gaming", region: "India", portal: "https://zupee.com", exec: "Dilsher Singh Malhi (Founder)", specificValue: "Add international rules Chess, Checkers, and Tawla to Zupee's $600M skill ecosystem." },
    { id: 87, company: "Games24x7", category: "Real-Money Skill Gaming", region: "India & Global", portal: "https://games24x7.com", exec: "Bhavin Pandya (Co-CEO)", specificValue: "License or buyout Nizalo's double-entry fintech ledger and multiplayer matchmaking core." },
    { id: 88, company: "Tether Studios", category: "Real-Money Skill Gaming", region: "North America", portal: "https://tetherstudios.com", exec: "Tim Trefren (CEO)", specificValue: "Port Nizalo's web multiplayer engines into standalone high-LTV tournament experiences." },
    { id: 89, company: "Elympics", category: "Real-Money Skill Gaming", region: "Global Web3", portal: "https://elympics.cc", exec: "Michal Dabrowski (CEO)", specificValue: "Integrate deterministic game state validation into decentralized gaming protocols." },
    { id: 90, company: "Big Run Studios", category: "Real-Money Skill Gaming", region: "North America", portal: "https://bigrunstudios.com", exec: "Andrew Bell (CEO)", specificValue: "Acquire IP to launch competitive social strategy games across mobile and web." },

    // 6. Tier-1 Operators & Gaming Private Equity (10)
    { id: 91, company: "Entain plc", category: "Tier-1 Regulated Operators", region: "UK & Global", portal: "https://entaingroup.com", exec: "Gavin Isaacs (CEO)", specificValue: "Acquire Nizalo as a non-gambling skill gaming acquisition funnel across bwin and PartyPoker." },
    { id: 92, company: "Flutter Entertainment", category: "Tier-1 Regulated Operators", region: "US, UK & Global", portal: "https://flutter.com", exec: "Peter Jackson (CEO)", specificValue: "Incorporate real-money mind sports into PokerStars / Betfair communities with zero house risk." },
    { id: 93, company: "Betsson Group", category: "Tier-1 Regulated Operators", region: "Scandinavia & LatAm", portal: "https://betssongroup.com", exec: "Pontus Lindwall (CEO)", specificValue: "Deploy Nizalo's multi-lingual white-label across Betsson's 20+ regulated European and LatAm brands." },
    { id: 94, company: "888 Holdings (Evoke)", category: "Tier-1 Regulated Operators", region: "Europe & Global", portal: "https://evokeplc.com", exec: "Per Widerström (CEO)", specificValue: "Boost player retention and LTV using peer-to-peer tournament leaderboards." },
    { id: 95, company: "Kaizen Gaming (Betano)", category: "Tier-1 Regulated Operators", region: "Europe & LatAm (Brazil)", portal: "https://kaizengaming.com", exec: "George Daskalakis (CEO)", specificValue: "Capture high-margin non-sports gaming revenue during seasonal sporting breaks." },
    { id: 96, company: "Tekkorp Capital", category: "Gaming M&A & Private Equity", region: "US & Global", portal: "https://tekkorp.com", exec: "Matt Davey (Founder & Chairman)", specificValue: "Evaluate $500K full IP buyout for portfolio synergy or bolt-on to an existing SPAC/operator." },
    { id: 97, company: "HappyHour.io", category: "Gaming M&A & Private Equity", region: "Malta & Europe", portal: "https://happyhour.io", exec: "Robin Reed (Managing Partner)", specificValue: "Acquisition or incubation of Nizalo's turnkey technology for a new high-growth venture." },
    { id: 98, company: "Bettor Capital", category: "Gaming M&A & Private Equity", region: "US", portal: "https://bettorcapital.com", exec: "Dave VanEgmond (Managing Partner)", specificValue: "Invest or syndicate Nizalo's tournament infrastructure across US regulated B2B channels." },
    { id: 99, company: "Play Ventures", category: "Gaming M&A & Private Equity", region: "Singapore & Europe", portal: "https://playventures.vc", exec: "Henric Suuronen (Founding Partner)", specificValue: "Acquire IP to deploy into emerging Web3 / real-money skill gaming ventures across Asia and Europe." },
    { id: 100, company: "Acquire.com", category: "Gaming M&A & Private Equity", region: "US & Global", portal: "https://acquire.com", exec: "Andrew Gazdecki (CEO & Founder)", specificValue: "Feature Nizalo on Acquire.com curated software M&A portal to 500,000+ verified tech buyers." }
];

function generateFormPitch(item) {
    const waText = encodeURIComponent(`Hi Hifzy, regarding Nizalo acquisition / partnership inquiry for ${item.company}`);
    const whatsappUrl = `${USER_WHATSAPP_BASE}?text=${waText}`;

    return {
        subject: `Strategic Inquiry: Turnkey P2P Skill Gaming Infrastructure (${item.company})`,
        message: `Hello ${item.company} Commercial & Partnerships Team,

I am reaching out regarding a strategic acquisition or licensing opportunity tailored for ${item.company}.

We have engineered Nizalo (https://nizalo.com) — an institutional-grade, turnkey P2P skill gaming and tournament infrastructure built for competitive mind sports (Chess Blitz, Backgammon/Tawla, Dominoes, Checkers, Speed Math, Connect Four, and 5 casual strategy duels).

Strategic Fit for ${item.company}:
• 11 In-House Proprietary Engines: 100% proprietary code with zero third-party rev-share.
• Risk-Free Rake Economics: Pure player-vs-player (P2P); operators generate an automated 5%–12% rake with zero house bankroll exposure or gambling volatility.
• Tailored Integration: ${item.specificValue}
• Modern Tech Stack: Built on Next.js 16, Node.js, WebSockets, crypto/fiat cashier (USDT, BTC, ETH) with sub-60s payouts, and 6-language white-label localization.

Deal Options Available:
1. Full Worldwide IP & Source Code Buyout ($500,000)
2. Turnkey White-Label Licensing ($25,000 – $75,000)

Live Demo & Tech Specs:
• Interactive B2B Sandbox: https://demo.nizalo.com/b2b
• Technical Pitch Deck: https://demo.nizalo.com/pitch-deck.html

Let's discuss directly via WhatsApp:
WhatsApp: ${whatsappUrl} (${USER_PHONE})
Direct Email: info@nizalo.com

Best regards,
Hifzy Hifzy
Founder & Systems Architect | Nizalo`
    };
}

// 1. Build JSON
const fullDataset = PORTALS_DATA.map(p => {
    const pitch = generateFormPitch(p);
    return {
        ...p,
        subject: pitch.subject,
        message: pitch.message
    };
});

fs.writeFileSync(path.join(rootDir, 'deliverables', '100_b2b_web_portals.json'), JSON.stringify(fullDataset, null, 2), 'utf8');
console.log('✅ Generated deliverables/100_b2b_web_portals.json successfully!');
