import pg from "pg";

const connectionString = "postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify";

const AR_NAMES = [
  { handle: "Tariq_ElSayed", gender: "m", bio: "أستاذ شطرنج تكتيكي ومحب للتحديات الذهنية ♟️" },
  { handle: "Karim_Mansour", gender: "m", bio: "بطل الطاولة والدومينو السريع 🎲" },
  { handle: "Nour_AlHassan", gender: "w", bio: "متخصصة استراتيجيات ريفيرسي وجوموكو ⚡" },
  { handle: "Ziad_Kabbani", gender: "m", bio: "لاعب ذكاء وحساب ذهني سريع 🧠" },
  { handle: "Yasmine_Fahmy", gender: "w", bio: "محترفة شطرنج خاطف وبطولات كبرى 🏆" },
  { handle: "Omar_AlSharif", gender: "m", bio: "عاشق السيجة والتراث العربي التكتيكي 🎯" },
  { handle: "Laila_Mahmoud", gender: "w", bio: "بطلة كونكت فور والداما الكلاسيكية 🔴" },
  { handle: "Hassan_AlBanna", gender: "m", bio: "أستاذ تكتيكات طاولة الزهر 🎲" },
  { handle: "Salma_Rizk", gender: "w", bio: "تكتيكية هادئة في مواجهات إكس أو والجوموكو 🟢" },
  { handle: "Mostafa_Ghanem", gender: "m", bio: "أستاذ رياضيات سريعة وحساب فوري 🔢" },
  { handle: "Farah_AlKhatib", gender: "w", bio: "لاعبة شطرنج هجومية لا ترحم ⚔️" },
  { handle: "Amr_Diab_Tactics", gender: "m", bio: "تكتيكي صلب في ريفيرسي والداما ⚫" },
  { handle: "Dina_Sherif", gender: "w", bio: "خبيرة بطولات الإقصاء الفردي 🏆" },
  { handle: "Khaled_Nasser", gender: "m", bio: "محترف استراتيجيات الحصار في السيجة 🎯" },
  { handle: "Mona_Zaki_Play", gender: "w", bio: "عاشقة الألعاب الذهنية وحل الألغاز 💡" },
  { handle: "Sherif_Mounir", gender: "m", bio: "منافس دائم على المراكز الأولى في الأرينا 🥇" },
  { handle: "Reem_AlOtaibi", gender: "w", bio: "أستاذة شطرنج من الرياض 🇸🇦" },
  { handle: "Faisal_AlGhamdi", gender: "m", bio: "خبير الطاولة والذكاء التنافسي 🎲" },
  { handle: "Heba_Kamal", gender: "w", bio: "متخصصة حساب ذهني وألعاب سرعة ⚡" },
  { handle: "Tamer_Hosny_Mind", gender: "m", bio: "دومينو وشطرنج باحترافية عالية 🀄" },
  { handle: "Aya_Soliman", gender: "w", bio: "تكتيك هادئ ودفاع حديدي 🛡️" },
  { handle: "Walid_Tawfik", gender: "m", bio: "لاعب قديم ومخضرم في ألعاب الطاولة 🎲" },
  { handle: "Rania_Youssef", gender: "w", bio: "سرعة وتركيز في بطولات الإقصاء ⚡" },
  { handle: "Mahmoud_Reda", gender: "m", bio: "بطل السيجة المصرية التراثية 🎯" },
  { handle: "Asmaa_Galal", gender: "w", bio: "لاعبة ريفيرسي وجوموكو بارعة ⚪" },
  { handle: "Ibrahim_Fathy", gender: "m", bio: "حساب ذهني لا يخطئ 🔢" },
  { handle: "Samar_Hamza", gender: "w", bio: "قوة تكتيكية وهجوم حاسم ⚔️" },
  { handle: "Youssef_ElChab", gender: "m", bio: "منافس شرس في صدارة البطولات 🏆" },
  { handle: "Nadine_Nassib", gender: "w", bio: "عاشقة التحدي والمهارة الخالصة 💎" },
  { handle: "Ramy_Sabry_Pro", gender: "m", bio: "دومينو احترافي وطاولة 🀄" },
];

const EN_NAMES = [
  { handle: "Alexander_Wright", gender: "m", bio: "Grandmaster mind, blitz specialist & chess theory nerd ♟️" },
  { handle: "Sarah_Jenkins", gender: "w", bio: "Reversi & Gomoku tactical analyst. Corner control is key ⚪" },
  { handle: "David_Miller_UK", gender: "m", bio: "Backgammon & Dominoes veteran. Precision pip counting 🎲" },
  { handle: "Emily_Watson", gender: "w", bio: "Speed Math prodigy and mental calculation champion 🔢" },
  { handle: "James_Thornton", gender: "m", bio: "Checkers strategist with 15+ years tournament play ⚫" },
  { handle: "Olivia_Bennett", gender: "w", bio: "Connect Four pattern recognizer and competitive gamer 🔴" },
  { handle: "Michael_Chang_US", gender: "m", bio: "Fast-paced arena duelist, always up for a high-stake game ⚔️" },
  { handle: "Jessica_Taylor", gender: "w", bio: "Deep positional chess player. Patience always wins ♟️" },
  { handle: "Robert_Sterling", gender: "m", bio: "Fintech analyst by day, tournament champion by night 🏆" },
  { handle: "Chloe_Davies", gender: "w", bio: "Math olympiad medalist and logic puzzle enthusiast 🧠" },
  { handle: "William_Scott", gender: "m", bio: "Strategic thinker with a passion for board games 🎲" },
  { handle: "Grace_Campbell", gender: "w", bio: "Counter-attacking specialist across all games 🛡️" },
  { handle: "Daniel_Hughes", gender: "m", bio: "High ELO speed math and blitz chess player ⚡" },
  { handle: "Sophia_Adams", gender: "w", bio: "Calculated moves and zero unforced errors 🎯" },
  { handle: "Matthew_Clark", gender: "m", bio: "Tournament climber aiming for the top 10 leaderboard 🥇" },
  { handle: "Hannah_Lewis", gender: "w", bio: "Obsidian reversi specialist. Flipping the board in style ⚪" },
  { handle: "Benjamin_Ward", gender: "m", bio: "Competitive mindset, pure skill esports advocate 💎" },
  { handle: "Ava_Robinson", gender: "w", bio: "Tactical defense and relentless endgame execution ♟️" },
  { handle: "Lucas_Mitchell", gender: "m", bio: "Fast reflexes, rapid moves, never flags on the clock ⏱️" },
  { handle: "Isabella_Hall", gender: "w", bio: "Five-in-a-row Gomoku zen master 🟢" },
  { handle: "Henry_Phillips", gender: "m", bio: "Old-school checkers and strategic thinking ⚫" },
  { handle: "Mia_Carter", gender: "w", bio: "Pattern recognition and speed math fanatic 🔢" },
  { handle: "Ethan_Turner", gender: "m", bio: "Always ready for an instant duel in the arena ⚔️" },
  { handle: "Charlotte_Collins", gender: "w", bio: "Esports competitor with sharp tactical acumen 🏆" },
  { handle: "Jacob_Stewart", gender: "m", bio: "Solid opening repertoire and strong middle games ♟️" },
  { handle: "Amelia_Sanchez_EN", gender: "w", bio: "Quick decision maker under time pressure ⏱️" },
  { handle: "Mason_Morris", gender: "m", bio: "Dominoes tournament finalist 🀄" },
  { handle: "Harper_Rogers", gender: "w", bio: "Skill-based gaming purist 🎯" },
  { handle: "Evelyn_Reed", gender: "w", bio: "Precision strikes and strategic planning 💡" },
  { handle: "Logan_Cook", gender: "m", bio: "Speed battle warrior, never surrenders ⚔️" },
];

const ES_NAMES = [
  { handle: "Carlos_Mendoza", gender: "m", bio: "Maestro FIDE de ajedrez y apasionado del blitz ♟️" },
  { handle: "Lucia_Fernandez", gender: "w", bio: "Especialista en cálculo rápido y olimpiadas matemáticas 🔢" },
  { handle: "Mateo_Gomez", gender: "m", bio: "Campeón de damas y dominó táctico 🎲" },
  { handle: "Valentina_Rios", gender: "w", bio: "Estratega de reversi y control de esquinas ⚪" },
  { handle: "Santiago_Morales", gender: "m", bio: "Jugador de ataque en torneos de eliminación directa ⚔️" },
  { handle: "Camila_Herrera", gender: "w", bio: "Ajedrecista posicional con finales impecables ♟️" },
  { handle: "Alejandro_Vargas", gender: "m", bio: "Experto en dominó clásico y cuatro en línea 🔴" },
  { handle: "Mariana_Castro", gender: "w", bio: "Mente analítica y fanática de la lógica matemática 🧠" },
  { handle: "Sebastian_Ortega", gender: "m", bio: "Competidor de élite en la arena de duelos 🏆" },
  { handle: "Daniela_Navarro", gender: "w", bio: "Maestra del gomoku zen y alineación de cinco piedras 🟢" },
  { handle: "Nicolas_Reyes", gender: "m", bio: "Estrategias sólidas sin margen de error 🎯" },
  { handle: "Sofia_Delgado", gender: "w", bio: "Velocidad mental y reflejos bajo presión de tiempo ⏱️" },
  { handle: "Diego_Pena", gender: "m", bio: "Veterano de torneos de mesa y deportes mentales 🎲" },
  { handle: "Gabriela_Silva", gender: "w", bio: "Juego limpio y cálculo milimétrico 💎" },
  { handle: "Esteban_Guerrero", gender: "m", bio: "Ataque frontal en ajedrez y damas ⚫" },
  { handle: "Paula_Cordero", gender: "w", bio: "Defensa impenetrable y contraataque letal 🛡️" },
  { handle: "Andres_Molina", gender: "m", bio: "Siempre listo para un duelo instantáneo ⚔️" },
  { handle: "Elena_Cabrera", gender: "w", bio: "Fascinada por los juegos de estrategia milenarios 💡" },
  { handle: "Javier_Fuentes", gender: "m", bio: "Especialista en cálculo de probabilidades 🔢" },
  { handle: "Victoria_Paredes", gender: "w", bio: "Campeona de copas de fin de semana 🥇" },
  { handle: "Manuel_Soto", gender: "m", bio: "Dominó y ajedrez clásico 🀄" },
  { handle: "Adriana_Leon", gender: "w", bio: "Rapidez y sangre fría en finales de partida ⚡" },
  { handle: "Ricardo_Cruz", gender: "m", bio: "Maestro táctico de damas internacionales ⚫" },
  { handle: "Natalia_Vega", gender: "w", bio: "Control territorial en reversi ⚪" },
  { handle: "Fernando_Ibanez", gender: "m", bio: "Lógica pura y concentración absoluta 🧠" },
  { handle: "Carolina_Ramos", gender: "w", bio: "Alineaciones maestras en conecta cuatro 🔴" },
  { handle: "Hugo_Santana", gender: "m", bio: "Duelos de alto nivel en la arena Nizalo ⚔️" },
  { handle: "Raquel_Medina", gender: "w", bio: "Estrategia profunda y juego limpio 🏆" },
  { handle: "Pablo_Campos", gender: "m", bio: "Cálculo mental relámpago 🔢" },
  { handle: "Beatriz_Aguilar", gender: "w", bio: "Pasión por los deportes mentales 💎" },
];

const FR_NAMES = [
  { handle: "Julien_Mercier", gender: "m", bio: "Maître tacticien aux échecs et passionné de blitz ♟️" },
  { handle: "Camille_Dubois", gender: "w", bio: "Spécialiste de calcul mental et olympiades de math 🔢" },
  { handle: "Antoine_Laurent", gender: "m", bio: "Expert en dames internationales et stratégie 🎲" },
  { handle: "Lea_Moreau", gender: "w", bio: "Maîtrise absolue du Reversi et contrôle des coins ⚪" },
  { handle: "Maxime_Girard", gender: "m", bio: "Compétiteur régulier des tournois à élimination ⚔️" },
  { handle: "Chloe_Roux", gender: "w", bio: "Jeu d'échecs positionnel et finales précises ♟️" },
  { handle: "Hugo_Fontaine", gender: "m", bio: "Amateur de dominos et puissance 4 tactique 🔴" },
  { handle: "Manon_Chevalier", gender: "w", bio: "Logique pure et rapidité d'exécution 🧠" },
  { handle: "Alexandre_Blanc", gender: "m", bio: "Grimpeur du classement ELO mondial 🏆" },
  { handle: "Emma_Vidal", gender: "w", bio: "Championne de Gomoku zen et alignements parfaits 🟢" },
  { handle: "Nicolas_Guerin", gender: "m", bio: "Sang-froid et précision sous pression ⏱️" },
  { handle: "Sarah_Gauthier", gender: "w", bio: "Défense solide et contre-attaques foudroyantes 🛡️" },
  { handle: "Thomas_Perrin", gender: "m", bio: "Toujours prêt pour un duel instantané ⚔️" },
  { handle: "Ines_Clement", gender: "w", bio: "Passionnée de jeux d'esprit et de stratégie 💡" },
  { handle: "Lucas_Morin", gender: "m", bio: "Spécialiste du calcul mental rapide 🔢" },
  { handle: "Mathilde_Henry", gender: "w", bio: "Jeu propre, équitable et haut niveau 💎" },
  { handle: "Romain_Roussel", gender: "m", bio: "Vétéran des tournois de dames et d'échecs ⚫" },
  { handle: "Clara_Boucher", gender: "w", bio: "Renversements spectaculaires à l'Othello ⚪" },
  { handle: "Florian_Lemoine", gender: "m", bio: "Esprit analytique et rigueur mathématique 🧠" },
  { handle: "Juliette_Picard", gender: "w", bio: "Alignements tactiques et vision du jeu 🎯" },
  { handle: "Clement_Gaillard", gender: "m", bio: "Performance constante en tournoi 🥇" },
  { handle: "Anais_Brunet", gender: "w", bio: "Vitesse de réflexion et précision ⚡" },
  { handle: "Quentin_Dumas", gender: "m", bio: "Défis de haut niveau sur l'arène Nizalo ⚔️" },
  { handle: "Oceane_Meyer", gender: "w", bio: "Stratégie profonde et respect du jeu 🏆" },
  { handle: "Valentin_Barbier", gender: "m", bio: "Amateur de parties rapides et intenses ⏱️" },
  { handle: "Audrey_Arnaud", gender: "w", bio: "Victoires nettes et sans bavure 💎" },
  { handle: "Benoit_Rolland", gender: "m", bio: "Domino stratégique et calcul de points 🀄" },
  { handle: "Pauline_Caron", gender: "w", bio: "Championne de connect-four 🔴" },
  { handle: "Guillaume_Aubry", gender: "m", bio: "Expertise échiquéenne approfondie ♟️" },
  { handle: "Margaux_Renard", gender: "w", bio: "Intelligence tactique et vivacité d'esprit 💡" },
];

const HI_NAMES = [
  { handle: "Aarav_Sharma", gender: "m", bio: "शतरंज ग्रैंडमास्टर और ब्लिट्ज़ विशेषज्ञ ♟️" },
  { handle: "Ananya_Patel", gender: "w", bio: "स्पीड मैथ और मानसिक गणना चैंपियन 🔢" },
  { handle: "Rohan_Verma", gender: "m", bio: "चेकर्स और लूडो रणनीति विशेषज्ञ 🎲" },
  { handle: "Priya_Iyer", gender: "w", bio: "रिवर्सि और गोमोकू रणनीति मास्टर ⚪" },
  { handle: "Aditya_Kumar", gender: "m", bio: "नॉकआउट टूर्नामेंट और तीव्र मुकाबला ⚔️" },
  { handle: "Diya_Nair", gender: "w", bio: "धैर्यवान शतरंज खिलाड़ी और एंडगेम विशेषज्ञ ♟️" },
  { handle: "Karan_Gupta", gender: "m", bio: "डोमिनोज़ और कनेक्ट फोर चैंपियन 🔴" },
  { handle: "Ishita_Reddy", gender: "w", bio: "शुद्ध तर्क और त्वरित प्रतिक्रिया 🧠" },
  { handle: "Vikram_Singh", gender: "m", bio: "ग्लोबल ईएलओ लीडरबोर्ड प्रतियोगी 🏆" },
  { handle: "Neha_Chopra", gender: "w", bio: "गोमोकू 5-इन-ए-रो ज़ेन मास्टर 🟢" },
  { handle: "Arjun_Mehta", gender: "m", bio: "समय के दबाव में सटीक निर्णय ⏱️" },
  { handle: "Sneha_Joshi", gender: "w", bio: "मजबूत रक्षा और घातक जवाबी हमला 🛡️" },
  { handle: "Rahul_Deshmukh", gender: "m", bio: "त्वरित द्वंद्वयुद्ध के लिए हमेशा तैयार ⚔️" },
  { handle: "Pooja_Bhatia", gender: "w", bio: "माइंड स्पोर्ट्स और रणनीति प्रेमी 💡" },
  { handle: "Amit_Singhania", gender: "m", bio: "बिजली की गति से मानसिक गणना 🔢" },
  { handle: "Tanvi_Saxena", gender: "w", bio: "फेयर प्ले और उच्च कौशल गेमर 💎" },
  { handle: "Varun_Malhotra", gender: "m", bio: "क्लासिक चेकर्स रणनीति ⚫" },
  { handle: "Shreya_Mishra", gender: "w", bio: "रिवर्सि बोर्ड कंट्रोल मास्टर ⚪" },
  { handle: "Nikhil_Bansal", gender: "m", bio: "विश्लेषणात्मक सोच और गहरी रणनीति 🧠" },
  { handle: "Rhea_Kulkarni", gender: "w", bio: "कनेक्ट फोर पैटर्न पहचान 🎯" },
  { handle: "Manish_Tiwari", gender: "m", bio: "लगातार शीर्ष प्रदर्शन 🥇" },
  { handle: "Kavita_Rao", gender: "w", bio: "सोच की गति और सटीकता ⚡" },
  { handle: "Siddharth_Kapoor", gender: "m", bio: "निज़ालो एरिना में उच्च दांव वाले मैच ⚔️" },
  { handle: "Swati_Pandey", gender: "w", bio: "गहरी रणनीति और निष्पक्ष खेल 🏆" },
  { handle: "Abhishek_Yadav", gender: "m", bio: "तेज़ चालें और अपराजेय ध्यान ⏱️" },
  { handle: "Meera_Sundaram", gender: "w", bio: "शानदार जीत और कुशल चालें 💎" },
  { handle: "Harsh_Vardhan", gender: "m", bio: "डोमिनोज़ रणनीति और ब्लॉक खेल 🀄" },
  { handle: "Anjali_Sen", gender: "w", bio: "चार-इन-ए-रो अखाड़ा विजेता 🔴" },
  { handle: "Gaurav_Dutta", gender: "m", bio: "शतरंज के गूढ़ सिद्धांत और रणनीति ♟️" },
  { handle: "Ritu_Aggarwal", gender: "w", bio: "बौद्धिक रणनीति और त्वरित सोच 💡" },
];

const ZH_NAMES = [
  { handle: "Li_Wei_Chess", gender: "m", bio: "国际象棋大师与快棋专家 ♟️" },
  { handle: "Zhang_Min_Math", gender: "w", bio: "极速心算与奥数冠军 🔢" },
  { handle: "Wang_Jun_Tactics", gender: "m", bio: "跳棋与多米诺骨牌战术大师 🎲" },
  { handle: "Chen_Xi_Reversi", gender: "w", bio: "黑白棋角位控制与全局大局观 ⚪" },
  { handle: "Liu_Yang_Arena", gender: "m", bio: "单败淘汰赛决斗高手 ⚔️" },
  { handle: "Yang_Fan_Master", gender: "w", bio: "深谋远虑的棋艺大师 ♟️" },
  { handle: "Huang_Jian", gender: "m", bio: "四子棋连珠大师 🔴" },
  { handle: "Zhao_Lei_Brain", gender: "w", bio: "纯粹逻辑与极速反应 🧠" },
  { handle: "Wu_Hao_Pro", gender: "m", bio: "全球ELO天梯榜名列前茅 🏆" },
  { handle: "Xu_Ting_Gomoku", gender: "w", bio: "五子棋连珠禅宗高手 🟢" },
  { handle: "Sun_Tao_Speed", gender: "m", bio: "时间紧迫下的精准杀着 ⏱️" },
  { handle: "Ma_Ling_Defense", gender: "w", bio: "坚不可摧的防守与致命反击 🛡️" },
  { handle: "Zhu_Bo_Duel", gender: "m", bio: "随时接受即时决斗挑战 ⚔️" },
  { handle: "Hu_Jie_Mind", gender: "w", bio: "智力竞技与战略思维热爱者 💡" },
  { handle: "Guo_Qiang_Math", gender: "m", bio: "闪电般的数字直觉 🔢" },
  { handle: "He_Ying_Pure", gender: "w", bio: "公平竞争与极致纯粹技巧 💎" },
  { handle: "Gao_Feng_Checkers", gender: "m", bio: "经典跳棋战术专家 ⚫" },
  { handle: "Lin_Dan_Obsidian", gender: "w", bio: "黑白棋盘翻盘大师 ⚪" },
  { handle: "Luo_Wei_Logic", gender: "m", bio: "严谨分析与极深算力 🧠" },
  { handle: "Zheng_Na_Connect", gender: "w", bio: "四子棋模式识别 🎯" },
  { handle: "Song_Chao_Top", gender: "m", bio: "锦标赛常胜将军 🥇" },
  { handle: "Xie_Li_Flash", gender: "w", bio: "思维迅捷与敏锐洞察 ⚡" },
  { handle: "Tang_Hao_Elite", gender: "m", bio: "Nizalo 竞技场高水准对决 ⚔️" },
  { handle: "Feng_Yuan_Grand", gender: "w", bio: "深厚棋理与公正裁决 🏆" },
  { handle: "Dong_Peng_Fast", gender: "m", bio: "行棋如风，从不超时 ⏱️" },
  { handle: "Xiao_Yue_Gems", gender: "w", bio: "行云流水的智力交锋 💎" },
  { handle: "Cheng_Long_Dom", gender: "m", bio: "骨牌大师与算牌专家 🀄" },
  { handle: "Cao_Jing_Four", gender: "w", bio: "四子棋竞技场冠军 🔴" },
  { handle: "Yuan_Kun_Grand", gender: "m", bio: "博弈论专家与战略大师 ♟️" },
  { handle: "Shen_Mei_Wisdom", gender: "w", bio: "智慧与谋略的完美结合 💡" },
];

const ELITE_HIGH_ROLLERS = [
  { handle: "Grandmaster_Tariq", gender: "m", bio: "جراند ماستر شطرنج عالمي وبطل البطولات الكبرى 👑" },
  { handle: "KingSlayer_EG", gender: "m", bio: "محترف تحديات نقدية سريعة والجوائز الكبرى ⚔️" },
  { handle: "Sultan_Of_Mind", gender: "m", bio: "خبير طاولة الزهر والدومينو الدولي 🎲" },
  { handle: "Magnus_Elite", gender: "m", bio: "2800+ ELO Grandmaster mind & blitz specialist ♟️" },
  { handle: "Queen_Gambit_Pro", gender: "w", bio: "High-stakes tournament finalist with flawless openings 💎" },
  { handle: "Apex_Tactician", gender: "m", bio: "Master of calculation, zero mistakes under pressure ⚡" },
  { handle: "El_Conquistador", gender: "m", bio: "Campeón de grandes copas en efectivo 🏆" },
  { handle: "La_Reina_Tactics", gender: "w", bio: "Especialista en torneos de élite y finales impecables 👑" },
  { handle: "Le_Grand_Maitre", gender: "m", bio: "Stratège d'exception sur les tournois majeurs 🥇" },
  { handle: "Viceroy_Of_Chess", gender: "m", bio: "Tactical depth, iron nerves, guaranteed spectacle ♟️" },
  { handle: "Sovereign_Math", gender: "m", bio: "Speed calculation grandmaster 🔢" },
  { handle: "Empress_Of_Reversi", gender: "w", bio: "Obsidian control, impossible comebacks ⚪" },
  { handle: "Zenith_Gomoku", gender: "m", bio: "Five-in-a-row tournament conqueror 🟢" },
  { handle: "Sultana_Zaman", gender: "w", bio: "أستاذة التكتيك والتحديات الحماسية 🎯" },
  { handle: "Baron_Von_Checkers", gender: "m", bio: "Checkers legend with 1000+ match experience ⚫" },
  { handle: "Crown_Seeker", gender: "m", bio: "Climbing to the pinnacle of Nizalo arena ⚔️" },
  { handle: "Oracle_Of_Nizalo", gender: "w", bio: "Provably fair esports master 💎" },
  { handle: "Titan_Of_Mind", gender: "m", bio: "Unbreakable focus in high-stake championships 🏆" },
  { handle: "Valkyrie_Mind", gender: "w", bio: "Fearless tactical combat across all boards ⚔️" },
  { handle: "Pharaoh_Tactics", gender: "m", bio: "أسطورة الشطرنج والسيجة والذكاء التنافسي 👑" },
];

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  console.log("Connected to Supabase PostgreSQL!");

  try {
    // 1. Ensure allow_direct_messages column exists on player
    await client.query(`ALTER TABLE player ADD COLUMN IF NOT EXISTS allow_direct_messages BOOLEAN NOT NULL DEFAULT TRUE;`);
    console.log("Verified allow_direct_messages column.");

    // 2. Prepare the list of 204 bots to keep
    const keepBotIds = [
      "ai-easy", "ai-medium", "ai-hard", "ai-expert"
    ];

    // Elite bots
    for (let i = 1; i <= 20; i++) {
      const pad = String(i).padStart(3, "0");
      keepBotIds.push(`bot_p_${pad}`);
    }

    // 30 bots per language
    const langs = ["ar", "en", "es", "fr", "hi", "zh"];
    for (const lang of langs) {
      for (let i = 1; i <= 30; i++) {
        const pad = String(i).padStart(3, "0");
        keepBotIds.push(`bot_${lang}_${pad}`);
      }
    }

    console.log(`Total bots to keep: ${keepBotIds.length}`);

    // 3. Upsert single-player AI bots
    const spBots = [
      { id: "ai-easy", handle: "EasyBot", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80", bio: "بوت التدريب للمبتدئين 🟢" },
      { id: "ai-medium", handle: "MediumBot", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80", bio: "بوت المستوى المتوسط 🟡" },
      { id: "ai-hard", handle: "HardBot", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80", bio: "بوت المستوى المتقدم 🔴" },
      { id: "ai-expert", handle: "GrandmasterAI", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80", bio: "ذكاء اصطناعي محترف بدرجة أستاذ دولي 👑" },
    ];

    for (const b of spBots) {
      await client.query(`
        INSERT INTO player (id, handle, bio, avatar_key, is_ai, allow_direct_messages)
        VALUES ($1, $2, $3, $4, TRUE, FALSE)
        ON CONFLICT (id) DO UPDATE SET
          handle = EXCLUDED.handle,
          bio = EXCLUDED.bio,
          avatar_key = EXCLUDED.avatar_key,
          is_ai = TRUE,
          allow_direct_messages = FALSE;
      `, [b.id, b.handle, b.bio, b.avatar]);
    }
    console.log("Upserted 4 single-player bots.");

    // 4. Upsert 20 elite bots
    for (let i = 0; i < 20; i++) {
      const botId = `bot_p_${String(i + 1).padStart(3, "0")}`;
      const item = ELITE_HIGH_ROLLERS[i];
      const portraitNum = 20 + i;
      const avatarUrl = item.gender === "m"
        ? `https://randomuser.me/api/portraits/men/${portraitNum}.jpg`
        : `https://randomuser.me/api/portraits/women/${portraitNum}.jpg`;

      await client.query(`
        INSERT INTO player (id, handle, bio, avatar_key, is_ai, allow_direct_messages)
        VALUES ($1, $2, $3, $4, TRUE, FALSE)
        ON CONFLICT (id) DO UPDATE SET
          handle = EXCLUDED.handle,
          bio = EXCLUDED.bio,
          avatar_key = EXCLUDED.avatar_key,
          is_ai = TRUE,
          allow_direct_messages = FALSE;
      `, [botId, item.handle, item.bio, avatarUrl]);
    }
    console.log("Upserted 20 elite bots.");

    // 5. Upsert language bots
    async function upsertLangBots(prefix, list, offset) {
      for (let i = 0; i < 30; i++) {
        const botId = `bot_${prefix}_${String(i + 1).padStart(3, "0")}`;
        const item = list[i];
        const portraitNum = ((offset + i) % 90) + 1;
        const avatarUrl = item.gender === "m"
          ? `https://randomuser.me/api/portraits/men/${portraitNum}.jpg`
          : `https://randomuser.me/api/portraits/women/${portraitNum}.jpg`;

        await client.query(`
          INSERT INTO player (id, handle, bio, avatar_key, is_ai, allow_direct_messages)
          VALUES ($1, $2, $3, $4, TRUE, FALSE)
          ON CONFLICT (id) DO UPDATE SET
            handle = EXCLUDED.handle,
            bio = EXCLUDED.bio,
            avatar_key = EXCLUDED.avatar_key,
            is_ai = TRUE,
            allow_direct_messages = FALSE;
        `, [botId, item.handle, item.bio, avatarUrl]);
      }
    }

    await upsertLangBots("ar", AR_NAMES, 1);
    await upsertLangBots("en", EN_NAMES, 15);
    await upsertLangBots("es", ES_NAMES, 30);
    await upsertLangBots("fr", FR_NAMES, 45);
    await upsertLangBots("hi", HI_NAMES, 60);
    await upsertLangBots("zh", ZH_NAMES, 75);
    console.log("Upserted all 180 language bots (AR, EN, ES, FR, HI, ZH).");

    // 6. Remove or deactivate excess bots from Supabase
    const excessBots = await client.query(
      `SELECT id FROM player WHERE is_ai = TRUE AND id != ALL($1)`,
      [keepBotIds]
    );
    console.log(`Found ${excessBots.rows.length} excess bots to clean up.`);

    if (excessBots.rows.length > 0) {
      const excessIds = excessBots.rows.map(r => r.id);
      await client.query(`DELETE FROM rating WHERE player_id = ANY($1)`, [excessIds]);
      await client.query(`DELETE FROM tournament_registration WHERE player_id = ANY($1)`, [excessIds]);

      try {
        await client.query(`DELETE FROM player WHERE id = ANY($1)`, [excessIds]);
        console.log(`Successfully deleted ${excessIds.length} excess bots.`);
      } catch (err) {
        console.log("Excess bots referenced in foreign keys; deactivating them...");
        await client.query(`
          UPDATE player SET
            handle = 'trimmed_' || id,
            is_ai = FALSE,
            disabled_at = now(),
            disabled_reason = 'Trimmed excess bot',
            allow_direct_messages = FALSE
          WHERE id = ANY($1)
        `, [excessIds]);
        console.log(`Deactivated ${excessIds.length} excess bots.`);
      }
    }

    // 7. Seed realistic ratings for the 204 bots across games
    console.log("Seeding realistic ratings for the 204 bots across games...");
    const games = ["chess", "xo", "connect-four", "checkers", "speed-math", "reversi", "gomoku", "backgammon", "dominoes", "seega"];
    
    // Check if table rating has vol_x100
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'rating' AND column_name = 'vol_x100';
    `);
    const hasVol = colCheck.rows.length > 0;

    let ratedCount = 0;
    for (let i = 0; i < keepBotIds.length; i++) {
      const botId = keepBotIds[i];
      const isElite = botId.startsWith("bot_p_") || botId === "ai-expert";

      for (const game of games) {
        // Elite bots get 2100 - 2850 ELO, regular bots get 1100 - 2200 ELO
        let baseElo = isElite ? 2100 + Math.floor(Math.random() * 750) : 1100 + Math.floor(Math.random() * 1100);
        const rating_x100 = baseElo * 100;
        const rd_x100 = 2500 + Math.floor(Math.random() * 2500);
        const games_played = 50 + Math.floor(Math.random() * 1500);

        if (hasVol) {
          await client.query(`
            INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, vol_x100, games_played)
            VALUES ($1, $2, $3, $4, 6, $5)
            ON CONFLICT (player_id, game_id) DO UPDATE SET
              rating_x100 = EXCLUDED.rating_x100,
              rd_x100 = EXCLUDED.rd_x100,
              vol_x100 = EXCLUDED.vol_x100,
              games_played = EXCLUDED.games_played;
          `, [botId, game, rating_x100, rd_x100, games_played]);
        } else {
          await client.query(`
            INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, games_played)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (player_id, game_id) DO UPDATE SET
              rating_x100 = EXCLUDED.rating_x100,
              rd_x100 = EXCLUDED.rd_x100,
              games_played = EXCLUDED.games_played;
          `, [botId, game, rating_x100, rd_x100, games_played]);
        }
      }
      ratedCount++;
    }

    console.log(`Seeded ratings for ${ratedCount} bots across ${games.length} games.`);

    // 8. Verification query
    const finalBots = await client.query("SELECT count(*) FROM player WHERE is_ai = TRUE");
    const sampleBots = await client.query(`
      SELECT p.id, p.handle, p.avatar_key, r.rating_x100 / 100 as elo, r.game_id 
      FROM player p 
      JOIN rating r ON p.id = r.player_id 
      WHERE p.is_ai = TRUE AND r.game_id = 'chess' 
      ORDER BY r.rating_x100 DESC 
      LIMIT 10;
    `);

    console.log(`\n=== Verification Results ===`);
    console.log(`Total active bots in Supabase: ${finalBots.rows[0].count}`);
    console.log(`Top 10 Chess Leaderboard Bots:`);
    sampleBots.rows.forEach((b, idx) => {
      console.log(`${idx + 1}. [${b.id}] ${b.handle} - ELO: ${b.elo} - Avatar: ${b.avatar_key?.slice(0, 45)}...`);
    });

  } finally {
    await client.end();
  }
}

main().catch(console.error);
