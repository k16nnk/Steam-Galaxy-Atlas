// キュレーション済みサンプルデータをDBへ投入する (実在appid / 数値は概算の推定値)。
// 実データ取得ができない環境での動作確認用。実データ取得後は不要。
//   node pipeline/seed-sample.js
// data_source は 'sample_curated'。実行後に fetch-steamspy.js 等を回せば実データで上書きされる。
import { openDb, nowIso } from './lib.js';

// [appid, title, dev, pub, genre, tags[]|null, owners, pos, neg, ccu, avgMin, priceCents, date|null, storeType|null, fullgame|null]
const ROWS = [
  // --- Multiplayer Competitive ---
  [730, 'Counter-Strike 2', 'Valve', 'Valve', 'Action', ['FPS', 'Shooter', 'Multiplayer', 'Competitive', 'PvP', 'esports', 'Tactical'], '50,000,000 .. 100,000,000', 6800000, 1200000, 1100000, 32000, 0, '2023-09-27', 'game', null],
  [570, 'Dota 2', 'Valve', 'Valve', 'Action, Strategy', ['MOBA', 'Multiplayer', 'Strategy', 'PvP', 'Competitive', 'esports', 'Team-Based'], '100,000,000 .. 200,000,000', 1800000, 400000, 550000, 41000, 0, '2013-07-09', 'game', null],
  [440, 'Team Fortress 2', 'Valve', 'Valve', 'Action', ['FPS', 'Multiplayer', 'Shooter', 'Class-Based', 'Comedy', 'PvP'], '50,000,000 .. 100,000,000', 900000, 80000, 85000, 9000, 0, '2007-10-10', 'game', null],
  [578080, 'PUBG: BATTLEGROUNDS', 'KRAFTON, Inc.', 'KRAFTON, Inc.', 'Action', ['Battle Royale', 'Shooter', 'Multiplayer', 'PvP', 'FPS', 'Survival'], '50,000,000 .. 100,000,000', 1500000, 900000, 400000, 24000, 0, '2017-12-21', 'game', null],
  [1172470, 'Apex Legends', 'Respawn Entertainment', 'Electronic Arts', 'Action', ['Battle Royale', 'FPS', 'Multiplayer', 'Shooter', 'PvP', 'Free to Play'], '50,000,000 .. 100,000,000', 600000, 300000, 300000, 12000, 0, '2020-11-04', 'game', null],
  [359550, "Tom Clancy's Rainbow Six Siege", 'Ubisoft Montreal', 'Ubisoft', 'Action', ['FPS', 'Tactical', 'Multiplayer', 'PvP', 'Competitive', 'Shooter'], '20,000,000 .. 50,000,000', 1100000, 200000, 70000, 18000, 1999, '2015-12-01', 'game', null],
  [1085660, 'Destiny 2', 'Bungie', 'Bungie', 'Action', ['FPS', 'MMO', 'Looter Shooter', 'Multiplayer', 'Co-op', 'Sci-fi'], '20,000,000 .. 50,000,000', 600000, 150000, 60000, 15000, 0, '2019-10-01', 'game', null],
  [236390, 'War Thunder', 'Gaijin Entertainment', 'Gaijin Entertainment', 'Action, Simulation', ['Military', 'Simulation', 'Multiplayer', 'PvP', 'Flight', 'Tanks'], '20,000,000 .. 50,000,000', 500000, 150000, 60000, 12000, 0, '2013-08-15', 'game', null],
  [230410, 'Warframe', 'Digital Extremes', 'Digital Extremes', 'Action', ['Looter Shooter', 'Free to Play', 'Co-op', 'Sci-fi', 'Third-Person Shooter', 'MMO'], '20,000,000 .. 50,000,000', 600000, 60000, 55000, 14000, 0, '2013-03-25', 'game', null],
  [945360, 'Among Us', 'Innersloth', 'Innersloth', 'Casual', ['Multiplayer', 'Social Deduction', 'PvP', 'Casual', 'Party', 'Funny'], '20,000,000 .. 50,000,000', 550000, 30000, 8000, 900, 499, '2018-11-16', 'game', null],
  // --- Action / story ---
  [271590, 'Grand Theft Auto V', 'Rockstar North', 'Rockstar Games', 'Action', ['Open World', 'Action', 'Multiplayer', 'Crime', 'Third-Person Shooter', 'Driving'], '50,000,000 .. 100,000,000', 1700000, 300000, 130000, 12000, 2999, '2015-04-14', 'game', null],
  [1174180, 'Red Dead Redemption 2', 'Rockstar Games', 'Rockstar Games', 'Action, Adventure', ['Open World', 'Western', 'Story Rich', 'Adventure', 'Action', 'Realistic'], '20,000,000 .. 50,000,000', 600000, 70000, 45000, 4200, 5999, '2019-12-05', 'game', null],
  [220, 'Half-Life 2', 'Valve', 'Valve', 'Action', ['FPS', 'Sci-fi', 'Story Rich', 'Classic', 'Shooter', 'Singleplayer'], '10,000,000 .. 20,000,000', 250000, 8000, 3000, 900, 999, '2004-11-16', 'game', null],
  [70, 'Half-Life', 'Valve', 'Valve', 'Action', ['FPS', 'Classic', 'Sci-fi', 'Shooter', 'Singleplayer'], '5,000,000 .. 10,000,000', 90000, 3000, 900, 700, 999, '1998-11-08', 'game', null],
  [400, 'Portal', 'Valve', 'Valve', 'Action', ['Puzzle', 'First-Person', 'Sci-fi', 'Comedy', 'Female Protagonist', 'Puzzle-Platformer', 'Classic'], '10,000,000 .. 20,000,000', 150000, 2500, 900, 300, 999, '2007-10-10', 'game', null],
  [620, 'Portal 2', 'Valve', 'Valve', 'Action, Adventure', ['Platformer', 'Puzzle', 'First-Person', 'Dark Humor', 'Story Rich', 'Co-op', 'Sci-fi'], '5,000,000 .. 10,000,000', 427835, 5675, 1959, 600, 999, '2011-04-18', 'game', null],
  [550, 'Left 4 Dead 2', 'Valve', 'Valve', 'Action', ['Zombies', 'Co-op', 'FPS', 'Multiplayer', 'Shooter', 'Horror'], '20,000,000 .. 50,000,000', 750000, 25000, 25000, 1500, 999, '2009-11-16', 'game', null],
  [782330, 'DOOM Eternal', 'id Software', 'Bethesda Softworks', 'Action', ['FPS', 'Gore', 'Fast-Paced', 'Shooter', 'Action', 'Singleplayer'], '5,000,000 .. 10,000,000', 160000, 12000, 3500, 1400, 3999, '2020-03-19', 'game', null],
  [814380, 'Sekiro: Shadows Die Twice', 'FromSoftware', 'Activision', 'Action, Adventure', ['Souls-like', 'Difficult', 'Action', 'Ninja', 'Singleplayer', 'Third Person'], '10,000,000 .. 20,000,000', 250000, 15000, 8000, 2500, 5999, '2019-03-21', 'game', null],
  [601150, 'Devil May Cry 5', 'Capcom', 'Capcom', 'Action', ['Hack and Slash', 'Action', 'Character Action Game', 'Demons', 'Stylish', 'Singleplayer'], '5,000,000 .. 10,000,000', 130000, 5000, 2500, 1200, 2999, '2019-03-08', 'game', null],
  [1593500, 'God of War', 'Santa Monica Studio', 'PlayStation PC LLC', 'Action, Adventure', ['Action', 'Adventure', 'Story Rich', 'Mythology', 'Third Person', 'Singleplayer'], '5,000,000 .. 10,000,000', 200000, 6000, 5000, 1500, 4999, '2022-01-14', 'game', null],
  [1237970, 'Titanfall 2', 'Respawn Entertainment', 'Electronic Arts', 'Action', ['FPS', 'Mechs', 'Multiplayer', 'Sci-fi', 'Shooter', 'Story Rich'], '5,000,000 .. 10,000,000', 130000, 6000, 4000, 900, 2999, '2020-06-18', 'game', null],
  [1332010, 'Stray', 'BlueTwelve Studio', 'Annapurna Interactive', 'Adventure', ['Cute', 'Adventure', 'Atmospheric', 'Cyberpunk', 'Exploration', 'Singleplayer'], '2,000,000 .. 5,000,000', 120000, 3500, 1500, 800, 2999, '2022-07-19', 'game', null],
  [1426210, 'It Takes Two', 'Hazelight Studios', 'Electronic Arts', 'Adventure', ['Co-op', 'Adventure', 'Platformer', 'Split Screen', 'Multiplayer', 'Puzzle'], '10,000,000 .. 20,000,000', 250000, 6000, 12000, 1000, 3999, '2021-03-26', 'game', null],
  [367520, 'Hollow Knight', 'Team Cherry', 'Team Cherry', 'Action, Adventure, Indie', ['Metroidvania', 'Platformer', 'Difficult', 'Atmospheric', 'Indie', '2D', 'Exploration'], '5,000,000 .. 10,000,000', 350000, 10000, 8000, 1700, 1499, '2017-02-24', 'game', null],
  [504230, 'Celeste', 'Extremely OK Games', 'Extremely OK Games', 'Action, Indie', ['Platformer', 'Difficult', 'Pixel Graphics', 'Story Rich', 'Indie', '2D', 'Precision Platformer'], '2,000,000 .. 5,000,000', 130000, 3000, 1500, 500, 1999, '2018-01-25', 'game', null],
  [268910, 'Cuphead', 'Studio MDHR', 'Studio MDHR', 'Action, Indie', ['Difficult', 'Cartoon', 'Platformer', 'Co-op', '2D', 'Boss Rush', 'Indie'], '5,000,000 .. 10,000,000', 200000, 6000, 1800, 700, 1999, '2017-09-29', 'game', null],
  [460950, 'Katana ZERO', 'Askiisoft', 'Devolver Digital', 'Action, Indie', ['Pixel Graphics', 'Fast-Paced', 'Story Rich', 'Difficult', '2D', 'Ninja', 'Indie'], '2,000,000 .. 5,000,000', 80000, 1500, 800, 300, 1499, '2019-04-18', 'game', null],
  [1229490, 'ULTRAKILL', 'Hakita', 'New Blood Interactive', 'Action, Indie, Early Access', ['FPS', 'Fast-Paced', 'Difficult', 'Retro', 'Boomer Shooter', 'Character Action Game'], '2,000,000 .. 5,000,000', 120000, 2000, 4000, 1200, 2499, '2020-09-03', 'game', null],
  [261570, 'Ori and the Blind Forest', 'Moon Studios GmbH', 'Xbox Game Studios', 'Adventure', ['Metroidvania', 'Platformer', 'Beautiful', 'Atmospheric', '2D', 'Story Rich'], '2,000,000 .. 5,000,000', 60000, 2000, 400, 300, 1999, '2015-03-11', 'game', null],
  [1057090, 'Ori and the Will of the Wisps', 'Moon Studios GmbH', 'Xbox Game Studios', 'Adventure', ['Metroidvania', 'Platformer', 'Beautiful', 'Atmospheric', '2D', 'Exploration'], '2,000,000 .. 5,000,000', 90000, 2500, 800, 400, 2999, '2020-03-11', 'game', null],
  [322500, 'SUPERHOT', 'SUPERHOT Team', 'SUPERHOT Team', 'Action, Indie', ['FPS', 'Time Manipulation', 'Puzzle', 'First-Person', 'Minimalist', 'Stylized'], '2,000,000 .. 5,000,000', 50000, 2500, 700, 300, 2499, '2016-02-25', 'game', null],
  // --- RPG ---
  [489830, 'The Elder Scrolls V: Skyrim Special Edition', 'Bethesda Game Studios', 'Bethesda Softworks', 'RPG', ['Open World', 'RPG', 'Fantasy', 'Moddable', 'Adventure', 'Singleplayer', 'Dragons'], '10,000,000 .. 20,000,000', 250000, 20000, 22000, 8000, 3999, '2016-10-27', 'game', null],
  [292030, 'The Witcher 3: Wild Hunt', 'CD PROJEKT RED', 'CD PROJEKT RED', 'RPG', ['Open World', 'RPG', 'Story Rich', 'Fantasy', 'Choices Matter', 'Action RPG', 'Mature'], '20,000,000 .. 50,000,000', 750000, 30000, 30000, 9000, 3999, '2015-05-18', 'game', null],
  [378648, 'The Witcher 3: Wild Hunt - Hearts of Stone', 'CD PROJEKT RED', 'CD PROJEKT RED', 'RPG', null, '5,000,000 .. 10,000,000', 30000, 800, 0, 0, 999, '2015-10-13', 'dlc', 292030],
  [378649, 'The Witcher 3: Wild Hunt - Blood and Wine', 'CD PROJEKT RED', 'CD PROJEKT RED', 'RPG', null, '5,000,000 .. 10,000,000', 45000, 900, 0, 0, 1999, '2016-05-31', 'dlc', 292030],
  [1091500, 'Cyberpunk 2077', 'CD PROJEKT RED', 'CD PROJEKT RED', 'RPG', ['Open World', 'RPG', 'Sci-fi', 'Cyberpunk', 'Story Rich', 'Action RPG', 'Futuristic'], '20,000,000 .. 50,000,000', 700000, 90000, 45000, 4500, 5999, '2020-12-10', 'game', null],
  [2138330, 'Cyberpunk 2077: Phantom Liberty', 'CD PROJEKT RED', 'CD PROJEKT RED', 'RPG', null, '5,000,000 .. 10,000,000', 60000, 3000, 0, 0, 2999, '2023-09-25', 'dlc', 1091500],
  [1245620, 'ELDEN RING', 'FromSoftware', 'FromSoftware / Bandai Namco', 'Action, RPG', ['Souls-like', 'Open World', 'Dark Fantasy', 'Difficult', 'Action RPG', 'Third Person'], '20,000,000 .. 50,000,000', 800000, 60000, 45000, 8000, 5999, '2022-02-25', 'game', null],
  [1086940, "Baldur's Gate 3", 'Larian Studios', 'Larian Studios', 'RPG', ['CRPG', 'Story Rich', 'Character Customization', 'Fantasy', 'Choices Matter', 'Turn-Based RPG'], '20,000,000 .. 50,000,000', 600000, 25000, 90000, 33000, 5999, '2023-08-03', 'game', null],
  [377160, 'Fallout 4', 'Bethesda Game Studios', 'Bethesda Softworks', 'RPG', ['Open World', 'Post-apocalyptic', 'RPG', 'Exploration', 'Shooter', 'Singleplayer'], '10,000,000 .. 20,000,000', 250000, 40000, 25000, 8000, 1999, '2015-11-10', 'game', null],
  [374320, 'DARK SOULS III', 'FromSoftware', 'Bandai Namco Entertainment', 'Action, RPG', ['Souls-like', 'Dark Fantasy', 'Difficult', 'Action RPG', 'Atmospheric', 'Third Person'], '10,000,000 .. 20,000,000', 250000, 15000, 15000, 4000, 5999, '2016-04-11', 'game', null],
  [570940, 'DARK SOULS: REMASTERED', 'FromSoftware', 'Bandai Namco Entertainment', 'Action, RPG', ['Souls-like', 'Dark Fantasy', 'Difficult', 'Action RPG', 'Atmospheric'], '2,000,000 .. 5,000,000', 60000, 5000, 3500, 1500, 3999, '2018-05-24', 'game', null],
  [435150, 'Divinity: Original Sin 2', 'Larian Studios', 'Larian Studios', 'RPG', ['CRPG', 'RPG', 'Turn-Based RPG', 'Co-op', 'Fantasy', 'Story Rich', 'Choices Matter'], '5,000,000 .. 10,000,000', 180000, 8000, 5000, 4500, 4499, '2017-09-14', 'game', null],
  [1687950, 'Persona 5 Royal', 'ATLUS', 'SEGA', 'RPG', ['JRPG', 'Story Rich', 'Anime', 'Turn-Based RPG', 'Stylish', 'Singleplayer'], '2,000,000 .. 5,000,000', 80000, 2000, 4000, 6000, 5999, '2022-10-20', 'game', null],
  [582010, 'Monster Hunter: World', 'Capcom', 'Capcom', 'Action', ['Co-op', 'Action RPG', 'Hunting', 'Multiplayer', 'Third Person', 'Difficult'], '20,000,000 .. 50,000,000', 400000, 60000, 40000, 6000, 2999, '2018-08-09', 'game', null],
  [1118010, 'Monster Hunter World: Iceborne', 'Capcom', 'Capcom', 'Action', null, '5,000,000 .. 10,000,000', 60000, 15000, 0, 0, 3999, '2020-01-09', 'dlc', 582010],
  [1446780, 'MONSTER HUNTER RISE', 'Capcom', 'Capcom', 'Action', ['Action RPG', 'Co-op', 'Hunting', 'Multiplayer', 'Third Person'], '5,000,000 .. 10,000,000', 130000, 15000, 6000, 4000, 3999, '2022-01-12', 'game', null],
  [1328670, 'Mass Effect Legendary Edition', 'BioWare', 'Electronic Arts', 'RPG', ['RPG', 'Sci-fi', 'Story Rich', 'Choices Matter', 'Third-Person Shooter', 'Space'], '2,000,000 .. 5,000,000', 80000, 3000, 2500, 2000, 5999, '2021-05-14', 'game', null],
  [1716740, 'Starfield', 'Bethesda Game Studios', 'Bethesda Softworks', 'RPG', ['Space', 'Open World', 'RPG', 'Exploration', 'Sci-fi', 'Singleplayer'], '10,000,000 .. 20,000,000', 120000, 90000, 8000, 3500, 6999, '2023-09-06', 'game', null],
  [39210, 'FINAL FANTASY XIV Online', 'Square Enix', 'Square Enix', 'RPG', ['MMO', 'JRPG', 'Fantasy', 'Story Rich', 'Multiplayer'], '2,000,000 .. 5,000,000', 70000, 15000, 25000, 30000, 1999, '2014-02-18', 'game', null],
  [632470, 'Disco Elysium - The Final Cut', 'ZA/UM', 'ZA/UM', 'RPG', ['CRPG', 'Story Rich', 'Detective', 'Choices Matter', 'Isometric', 'Narration'], '2,000,000 .. 5,000,000', 120000, 6000, 2500, 3000, 3999, '2019-10-15', 'game', null],
  [1627720, 'Lies of P', 'Round8 Studio', 'Neowiz Games', 'Action, RPG', ['Souls-like', 'Dark Fantasy', 'Action RPG', 'Difficult', 'Story Rich'], '2,000,000 .. 5,000,000', 60000, 4000, 2000, 2500, 5999, '2023-09-18', 'game', null],
  [391540, 'Undertale', 'tobyfox', 'tobyfox', 'Indie, RPG', ['Story Rich', 'RPG', 'Pixel Graphics', 'Comedy', 'Choices Matter', 'Cult Classic'], '5,000,000 .. 10,000,000', 250000, 6000, 3500, 1200, 999, '2015-09-15', 'game', null],
  [238960, 'Path of Exile', 'Grinding Gear Games', 'Grinding Gear Games', 'Action, RPG', ['Action RPG', 'Hack and Slash', 'Free to Play', 'Loot', 'Dark Fantasy', 'Multiplayer'], '20,000,000 .. 50,000,000', 250000, 30000, 35000, 15000, 0, '2013-10-23', 'game', null],
  [306130, 'The Elder Scrolls Online', 'ZeniMax Online Studios', 'Bethesda Softworks', 'RPG', ['MMO', 'RPG', 'Fantasy', 'Multiplayer', 'Open World'], '10,000,000 .. 20,000,000', 130000, 30000, 15000, 12000, 1999, '2014-07-09', 'game', null],
  [1284210, 'Guild Wars 2', 'ArenaNet', 'NCSOFT', 'Massively Multiplayer, RPG', ['MMO', 'Fantasy', 'RPG', 'Multiplayer', 'Open World'], '5,000,000 .. 10,000,000', 60000, 8000, 8000, 6000, 0, '2022-08-23', 'game', null],
  [1599340, 'Lost Ark', 'Smilegate RPG', 'Amazon Games', 'Action, Massively Multiplayer, RPG', ['MMO', 'Action RPG', 'Isometric', 'Fantasy', 'Multiplayer', 'Free to Play'], '20,000,000 .. 50,000,000', 200000, 90000, 30000, 8000, 0, '2022-02-11', 'game', null],
  // --- Strategy ---
  [8930, "Sid Meier's Civilization V", 'Firaxis Games', '2K', 'Strategy', ['Turn-Based Strategy', 'Strategy', '4X', 'Historical', 'Multiplayer', 'Classic'], '10,000,000 .. 20,000,000', 220000, 8000, 20000, 12000, 2999, '2010-09-21', 'game', null],
  [289070, "Sid Meier's Civilization VI", 'Firaxis Games', '2K', 'Strategy', ['Turn-Based Strategy', 'Strategy', '4X', 'Historical', 'Multiplayer'], '10,000,000 .. 20,000,000', 250000, 40000, 30000, 11000, 5999, '2016-10-20', 'game', null],
  [947510, "Sid Meier's Civilization VI: Gathering Storm", 'Firaxis Games', '2K', 'Strategy', null, '2,000,000 .. 5,000,000', 15000, 1500, 0, 0, 3999, '2019-02-14', 'dlc', 289070],
  [281990, 'Stellaris', 'Paradox Development Studio', 'Paradox Interactive', 'Strategy', ['Grand Strategy', 'Space', 'Strategy', '4X', 'Sci-fi', 'Multiplayer'], '5,000,000 .. 10,000,000', 130000, 15000, 15000, 14000, 3999, '2016-05-09', 'game', null],
  [553280, 'Stellaris: Utopia', 'Paradox Development Studio', 'Paradox Interactive', 'Strategy', null, '1,000,000 .. 2,000,000', 8000, 900, 0, 0, 1999, '2017-04-06', 'dlc', 281990],
  [236850, 'Europa Universalis IV', 'Paradox Development Studio', 'Paradox Interactive', 'Strategy', ['Grand Strategy', 'Historical', 'Strategy', 'Diplomacy', 'Multiplayer'], '2,000,000 .. 5,000,000', 80000, 8000, 9000, 25000, 3999, '2013-08-13', 'game', null],
  [394360, 'Hearts of Iron IV', 'Paradox Development Studio', 'Paradox Interactive', 'Strategy', ['Grand Strategy', 'World War II', 'Strategy', 'Historical', 'War', 'Multiplayer'], '5,000,000 .. 10,000,000', 220000, 15000, 30000, 22000, 4999, '2016-06-06', 'game', null],
  [1158310, 'Crusader Kings III', 'Paradox Development Studio', 'Paradox Interactive', 'Strategy', ['Grand Strategy', 'Medieval', 'Strategy', 'RPG', 'Historical'], '2,000,000 .. 5,000,000', 90000, 6000, 15000, 12000, 4999, '2020-09-01', 'game', null],
  [813780, 'Age of Empires II: Definitive Edition', 'Forgotten Empires', 'Xbox Game Studios', 'Strategy', ['RTS', 'Strategy', 'Historical', 'Medieval', 'Multiplayer', 'Classic'], '5,000,000 .. 10,000,000', 160000, 8000, 20000, 9000, 1999, '2019-11-14', 'game', null],
  [1466860, 'Age of Empires IV', 'Relic Entertainment', 'Xbox Game Studios', 'Strategy', ['RTS', 'Strategy', 'Historical', 'Medieval', 'Multiplayer'], '2,000,000 .. 5,000,000', 50000, 8000, 6000, 3500, 3999, '2021-10-28', 'game', null],
  [268500, 'XCOM 2', 'Firaxis Games', '2K', 'Strategy', ['Turn-Based Strategy', 'Strategy', 'Sci-fi', 'Tactical', 'Difficult'], '5,000,000 .. 10,000,000', 80000, 12000, 3000, 6000, 5999, '2016-02-04', 'game', null],
  [590380, 'Into the Breach', 'Subset Games', 'Subset Games', 'Strategy', ['Turn-Based Strategy', 'Strategy', 'Tactical', 'Sci-fi', 'Mechs', 'Pixel Graphics', 'Indie'], '1,000,000 .. 2,000,000', 40000, 1500, 1000, 1000, 1499, '2018-02-27', 'game', null],
  [261550, 'Mount & Blade II: Bannerlord', 'TaleWorlds Entertainment', 'TaleWorlds Entertainment', 'Action, RPG, Strategy', ['Medieval', 'Open World', 'Strategy', 'RPG', 'War'], '5,000,000 .. 10,000,000', 250000, 30000, 25000, 20000, 4999, '2022-10-25', 'game', null],
  // --- Roguelike ---
  [1145360, 'Hades', 'Supergiant Games', 'Supergiant Games', 'Action, Indie', ['Roguelike', 'Roguelite', 'Hack and Slash', 'Story Rich', 'Mythology', 'Indie'], '5,000,000 .. 10,000,000', 250000, 4000, 8000, 4000, 2499, '2020-09-17', 'game', null],
  [588650, 'Dead Cells', 'Motion Twin', 'Motion Twin', 'Action, Indie', ['Roguelite', 'Metroidvania', 'Platformer', 'Difficult', 'Pixel Graphics', 'Action'], '5,000,000 .. 10,000,000', 130000, 5000, 5000, 2500, 2499, '2018-08-07', 'game', null],
  [632360, 'Risk of Rain 2', 'Hopoo Games', 'Gearbox Publishing', 'Action', ['Roguelite', 'Third-Person Shooter', 'Co-op', 'Multiplayer', 'Action', 'Sci-fi'], '5,000,000 .. 10,000,000', 220000, 6000, 8000, 3500, 2499, '2020-08-11', 'game', null],
  [311690, 'Enter the Gungeon', 'Dodge Roll', 'Devolver Digital', 'Action, Indie', ['Roguelike', 'Bullet Hell', 'Pixel Graphics', 'Shoot Em Up', 'Co-op', 'Difficult'], '2,000,000 .. 5,000,000', 90000, 3000, 2000, 900, 1499, '2016-04-05', 'game', null],
  [250900, 'The Binding of Isaac: Rebirth', 'Nicalis, Inc.', 'Nicalis, Inc.', 'Action, Indie', ['Roguelike', 'Replay Value', 'Dark', 'Pixel Graphics', 'Difficult', 'Indie'], '5,000,000 .. 10,000,000', 220000, 5000, 15000, 12000, 1499, '2014-11-04', 'game', null],
  [1794680, 'Vampire Survivors', 'poncle', 'poncle', 'Action, Casual, Indie', ['Roguelite', 'Bullet Hell', 'Casual', 'Pixel Graphics', 'Action', 'Arcade'], '5,000,000 .. 10,000,000', 250000, 4000, 15000, 3500, 499, '2022-10-20', 'game', null],
  [881100, 'Noita', 'Nolla Games', 'Nolla Games', 'Action, Indie', ['Roguelite', 'Physics', 'Pixel Graphics', 'Difficult', 'Magic'], '2,000,000 .. 5,000,000', 90000, 3500, 4000, 2500, 1999, '2020-10-15', 'game', null],
  [212680, 'FTL: Faster Than Light', 'Subset Games', 'Subset Games', 'Strategy, Indie', ['Roguelike', 'Space', 'Strategy', 'Sci-fi', 'Difficult', 'Singleplayer'], '2,000,000 .. 5,000,000', 80000, 2500, 1200, 1500, 999, '2012-09-14', 'game', null],
  [262060, 'Darkest Dungeon', 'Red Hook Studios', 'Red Hook Studios', 'RPG, Indie', ['Roguelike', 'Gothic', 'Turn-Based RPG', 'Difficult', 'Dark Fantasy'], '2,000,000 .. 5,000,000', 90000, 6000, 2000, 3000, 2499, '2016-01-19', 'game', null],
  [1313140, 'Cult of the Lamb', 'Massive Monster', 'Devolver Digital', 'Action, Indie', ['Roguelite', 'Cute', 'Dark Humor', 'Management', 'Colony Sim'], '2,000,000 .. 5,000,000', 90000, 3000, 4000, 2000, 2499, '2022-08-11', 'game', null],
  [646570, 'Slay the Spire', 'MegaCrit', 'MegaCrit', 'Indie, Strategy', ['Roguelike Deckbuilder', 'Card Game', 'Roguelite', 'Strategy', 'Turn-Based', 'Indie'], '5,000,000 .. 10,000,000', 180000, 4000, 12000, 9000, 2499, '2019-01-23', 'game', null],
  [2379780, 'Balatro', 'LocalThunk', 'Playstack', 'Casual, Indie, Strategy', ['Roguelike Deckbuilder', 'Card Game', 'Roguelite', 'Casual', 'Indie', 'Addictive'], '2,000,000 .. 5,000,000', 120000, 2000, 20000, 5000, 1499, '2024-02-20', 'game', null],
  // --- Simulation ---
  [255710, 'Cities: Skylines', 'Colossal Order Ltd.', 'Paradox Interactive', 'Simulation', ['City Builder', 'Simulation', 'Management', 'Building', 'Singleplayer'], '10,000,000 .. 20,000,000', 160000, 12000, 12000, 6000, 2999, '2015-03-10', 'game', null],
  [227300, 'Euro Truck Simulator 2', 'SCS Software', 'SCS Software', 'Simulation', ['Driving', 'Simulation', 'Automobile Sim', 'Open World', 'Economy'], '10,000,000 .. 20,000,000', 300000, 8000, 30000, 12000, 1999, '2013-01-16', 'game', null],
  [1250410, 'Microsoft Flight Simulator', 'Asobo Studio', 'Xbox Game Studios', 'Simulation', ['Flight', 'Simulation', 'Realistic', 'Open World', 'VR'], '2,000,000 .. 5,000,000', 60000, 12000, 4000, 4000, 5999, '2020-08-18', 'game', null],
  [220200, 'Kerbal Space Program', 'Squad', 'Private Division', 'Simulation', ['Space', 'Physics', 'Simulation', 'Building', 'Science'], '5,000,000 .. 10,000,000', 150000, 5000, 4000, 6000, 3999, '2015-04-27', 'game', null],
  [294100, 'RimWorld', 'Ludeon Studios', 'Ludeon Studios', 'Simulation, Strategy', ['Colony Sim', 'Simulation', 'Management', 'Sci-fi', 'Singleplayer'], '2,000,000 .. 5,000,000', 180000, 4000, 20000, 25000, 3499, '2018-10-17', 'game', null],
  [1149640, 'RimWorld - Royalty', 'Ludeon Studios', 'Ludeon Studios', 'Simulation', null, '1,000,000 .. 2,000,000', 8000, 600, 0, 0, 1999, '2020-02-24', 'dlc', 294100],
  [457140, 'Oxygen Not Included', 'Klei Entertainment', 'Klei Entertainment', 'Simulation', ['Colony Sim', 'Simulation', 'Management', 'Sci-fi', 'Difficult'], '2,000,000 .. 5,000,000', 120000, 4000, 8000, 15000, 2499, '2019-07-30', 'game', null],
  [1290000, 'PowerWash Simulator', 'FuturLab', 'Square Enix', 'Simulation', ['Relaxing', 'Simulation', 'Casual', 'First-Person', 'Cozy'], '2,000,000 .. 5,000,000', 70000, 2000, 3000, 2000, 2499, '2022-07-14', 'game', null],
  [1248130, 'Farming Simulator 22', 'GIANTS Software', 'GIANTS Software', 'Simulation', ['Farming Sim', 'Simulation', 'Management', 'Multiplayer', 'Realistic'], '2,000,000 .. 5,000,000', 60000, 6000, 12000, 8000, 2499, '2021-11-22', 'game', null],
  [427520, 'Factorio', 'Wube Software LTD.', 'Wube Software LTD.', 'Simulation, Strategy', ['Automation', 'Base Building', 'Resource Management', 'Crafting', 'Management', 'Simulation'], '5,000,000 .. 10,000,000', 180000, 2500, 25000, 20000, 3500, '2020-08-14', 'game', null],
  [526870, 'Satisfactory', 'Coffee Stain Studios', 'Coffee Stain Publishing', 'Simulation', ['Automation', 'Base Building', 'Open World', 'Co-op', 'Simulation', 'First-Person'], '5,000,000 .. 10,000,000', 180000, 6000, 20000, 12000, 3999, '2024-09-10', 'game', null],
  [1868140, 'DAVE THE DIVER', 'MINTROCKET', 'MINTROCKET', 'Adventure, Casual', ['Management', 'Adventure', 'Casual', 'Story Rich', 'Fishing', 'Pixel Graphics'], '2,000,000 .. 5,000,000', 130000, 4000, 8000, 2000, 1999, '2023-06-28', 'game', null],
  [2252570, 'Football Manager 2024', 'Sports Interactive', 'SEGA', 'Simulation, Sports', ['Soccer', 'Sports', 'Management', 'Simulation', 'Singleplayer'], '2,000,000 .. 5,000,000', 35000, 4000, 25000, 40000, 5999, '2023-11-06', 'game', null],
  // --- Sports & Racing ---
  [284160, 'BeamNG.drive', 'BeamNG', 'BeamNG', 'Racing, Simulation, Early Access', ['Driving', 'Physics', 'Simulation', 'Racing', 'Destruction'], '5,000,000 .. 10,000,000', 250000, 3000, 15000, 6000, 2499, '2015-05-29', 'game', null],
  [244210, 'Assetto Corsa', 'Kunos Simulazioni', 'Kunos Simulazioni', 'Racing', ['Racing', 'Simulation', 'Driving', 'Realistic', 'Multiplayer', 'VR'], '5,000,000 .. 10,000,000', 130000, 8000, 15000, 5000, 1999, '2014-12-19', 'game', null],
  [1551360, 'Forza Horizon 5', 'Playground Games', 'Xbox Game Studios', 'Racing', ['Racing', 'Open World', 'Driving', 'Multiplayer', 'Arcade'], '5,000,000 .. 10,000,000', 150000, 15000, 15000, 5000, 5999, '2021-11-08', 'game', null],
  [690790, 'DiRT Rally 2.0', 'Codemasters', 'Codemasters', 'Racing', ['Racing', 'Rally', 'Simulation', 'Driving', 'Realistic'], '1,000,000 .. 2,000,000', 30000, 2000, 1200, 1500, 1999, '2019-02-25', 'game', null],
  // --- Sandbox Survival ---
  [252490, 'Rust', 'Facepunch Studios', 'Facepunch Studios', 'Action, Massively Multiplayer', ['Survival', 'Crafting', 'Multiplayer', 'Open World', 'Base Building', 'Shooter'], '20,000,000 .. 50,000,000', 800000, 150000, 90000, 20000, 3999, '2018-02-08', 'game', null],
  [105600, 'Terraria', 'Re-Logic', 'Re-Logic', 'Action, Adventure, Indie', ['Sandbox', 'Survival', 'Crafting', '2D', 'Adventure', 'Multiplayer', 'Pixel Graphics'], '20,000,000 .. 50,000,000', 1100000, 25000, 40000, 10000, 999, '2011-05-16', 'game', null],
  [892970, 'Valheim', 'Iron Gate AB', 'Coffee Stain Publishing', 'Action, Adventure, Indie, Early Access', ['Survival', 'Open World Survival Craft', 'Viking', 'Multiplayer', 'Crafting', 'Exploration'], '10,000,000 .. 20,000,000', 400000, 20000, 20000, 4500, 1999, '2021-02-02', 'game', null],
  [264710, 'Subnautica', 'Unknown Worlds Entertainment', 'Unknown Worlds Entertainment', 'Adventure', ['Survival', 'Underwater', 'Exploration', 'Open World Survival Craft', 'Crafting', 'Atmospheric'], '5,000,000 .. 10,000,000', 300000, 8000, 8000, 4000, 2999, '2018-01-23', 'game', null],
  [1326470, 'Sons Of The Forest', 'Endnight Games Ltd', 'Newnight', 'Action, Adventure', ['Survival', 'Open World Survival Craft', 'Multiplayer', 'Crafting', 'Building'], '5,000,000 .. 10,000,000', 200000, 30000, 10000, 2500, 2999, '2024-02-22', 'game', null],
  [346110, 'ARK: Survival Evolved', 'Studio Wildcard', 'Studio Wildcard', 'Action, Adventure', ['Survival', 'Dinosaurs', 'Open World', 'Multiplayer', 'Crafting', 'Base Building'], '20,000,000 .. 50,000,000', 500000, 130000, 35000, 15000, 999, '2017-08-08', 'game', null],
  [221100, 'DayZ', 'Bohemia Interactive', 'Bohemia Interactive', 'Action, Adventure, Massively Multiplayer', ['Survival', 'Zombies', 'Multiplayer', 'Open World', 'Post-apocalyptic'], '5,000,000 .. 10,000,000', 250000, 90000, 25000, 12000, 4499, '2018-12-13', 'game', null],
  [322330, "Don't Starve Together", 'Klei Entertainment', 'Klei Entertainment', 'Adventure, Indie', ['Survival', 'Co-op', 'Crafting', 'Multiplayer', 'Cartoon', 'Difficult'], '10,000,000 .. 20,000,000', 300000, 10000, 15000, 5000, 1499, '2016-04-21', 'game', null],
  [108600, 'Project Zomboid', 'The Indie Stone', 'The Indie Stone', 'Simulation, Indie, Early Access', ['Survival', 'Zombies', 'Open World Survival Craft', 'Isometric', 'Crafting', 'Multiplayer'], '5,000,000 .. 10,000,000', 250000, 10000, 20000, 15000, 1999, '2013-11-08', 'game', null],
  [648800, 'Raft', 'Redbeet Interactive', 'Axolot Games', 'Adventure, Indie', ['Survival', 'Co-op', 'Crafting', 'Open World Survival Craft', 'Multiplayer', 'Underwater'], '10,000,000 .. 20,000,000', 250000, 8000, 8000, 4000, 1999, '2022-06-20', 'game', null],
  [275850, "No Man's Sky", 'Hello Games', 'Hello Games', 'Action, Adventure', ['Space', 'Exploration', 'Survival', 'Open World', 'Sci-fi', 'Crafting'], '5,000,000 .. 10,000,000', 250000, 60000, 12000, 9000, 5999, '2016-08-12', 'game', null],
  [1623730, 'Palworld', 'Pocketpair', 'Pocketpair', 'Action, Adventure, Early Access', ['Survival', 'Open World', 'Creature Collector', 'Multiplayer', 'Crafting', 'Base Building'], '20,000,000 .. 50,000,000', 350000, 25000, 30000, 8000, 2999, '2024-01-19', 'game', null],
  // --- Horror ---
  [739630, 'Phasmophobia', 'Kinetic Games', 'Kinetic Games', 'Indie, Early Access', ['Horror', 'Co-op', 'Multiplayer', 'Psychological Horror', 'First-Person', 'Investigation'], '10,000,000 .. 20,000,000', 500000, 20000, 25000, 5000, 1999, '2020-09-18', 'game', null],
  [381210, 'Dead by Daylight', 'Behaviour Interactive Inc.', 'Behaviour Interactive Inc.', 'Action', ['Horror', 'Multiplayer', 'Survival Horror', 'Co-op', 'Perma Death'], '20,000,000 .. 50,000,000', 500000, 150000, 35000, 12000, 1999, '2016-06-14', 'game', null],
  [883710, 'Resident Evil 2', 'Capcom', 'Capcom', 'Action', ['Survival Horror', 'Horror', 'Zombies', 'Remake', 'Third Person', 'Singleplayer'], '5,000,000 .. 10,000,000', 130000, 4000, 3000, 1500, 3999, '2019-01-24', 'game', null],
  [2050650, 'Resident Evil 4', 'Capcom', 'Capcom', 'Action', ['Survival Horror', 'Horror', 'Action', 'Remake', 'Third Person', 'Zombies'], '5,000,000 .. 10,000,000', 120000, 3000, 4000, 2000, 5999, '2023-03-23', 'game', null],
  [1196590, 'Resident Evil Village', 'Capcom', 'Capcom', 'Action', ['Survival Horror', 'Horror', 'First-Person', 'Action', 'Singleplayer'], '2,000,000 .. 5,000,000', 90000, 4000, 2500, 1800, 3999, '2021-05-07', 'game', null],
  [242760, 'The Forest', 'Endnight Games Ltd', 'Endnight Games Ltd', 'Adventure, Indie', ['Survival', 'Horror', 'Open World Survival Craft', 'Crafting', 'Multiplayer'], '5,000,000 .. 10,000,000', 350000, 15000, 10000, 3000, 1999, '2018-04-30', 'game', null],
  [238320, 'Outlast', 'Red Barrels', 'Red Barrels', 'Adventure, Indie', ['Horror', 'Psychological Horror', 'Survival Horror', 'First-Person', 'Atmospheric'], '5,000,000 .. 10,000,000', 120000, 4000, 1200, 800, 1999, '2013-09-04', 'game', null],
  [282140, 'SOMA', 'Frictional Games', 'Frictional Games', 'Adventure, Indie', ['Horror', 'Story Rich', 'Psychological Horror', 'Sci-fi', 'Atmospheric', 'Underwater'], '2,000,000 .. 5,000,000', 60000, 2000, 800, 500, 2999, '2015-09-22', 'game', null],
  [214490, 'Alien: Isolation', 'Creative Assembly', 'SEGA', 'Action', ['Horror', 'Survival Horror', 'Stealth', 'Sci-fi', 'Atmospheric', 'Aliens'], '2,000,000 .. 5,000,000', 70000, 4000, 1500, 900, 3999, '2014-10-06', 'game', null],
  [1966720, 'Lethal Company', 'Zeekerss', 'Zeekerss', 'Indie, Early Access', ['Horror', 'Co-op', 'Multiplayer', 'Comedy', 'First-Person', 'Online Co-Op'], '10,000,000 .. 20,000,000', 350000, 12000, 20000, 3000, 999, '2023-10-23', 'game', null],
  [57300, 'Amnesia: The Dark Descent', 'Frictional Games', 'Frictional Games', 'Adventure, Indie', ['Horror', 'Psychological Horror', 'Survival Horror', 'First-Person', 'Atmospheric', 'Classic'], '2,000,000 .. 5,000,000', 40000, 1500, 300, 400, 1999, '2010-09-08', 'game', null],
  // --- Cozy ---
  [413150, 'Stardew Valley', 'ConcernedApe', 'ConcernedApe', 'Simulation, RPG, Indie', ['Farming Sim', 'Life Sim', 'Pixel Graphics', 'Relaxing', 'Multiplayer', 'RPG'], '20,000,000 .. 50,000,000', 800000, 12000, 60000, 8000, 1499, '2016-02-26', 'game', null],
  [1135690, 'Unpacking', 'Witch Beam', 'Humble Games', 'Casual, Indie', ['Cozy', 'Relaxing', 'Casual', 'Puzzle', 'Short', 'Wholesome'], '1,000,000 .. 2,000,000', 30000, 800, 400, 200, 1999, '2021-11-02', 'game', null],
  [1055540, 'A Short Hike', 'adamgryu', 'adamgryu', 'Adventure, Indie', ['Cozy', 'Exploration', 'Relaxing', 'Cute', 'Short', 'Adventure'], '1,000,000 .. 2,000,000', 40000, 500, 600, 150, 799, '2019-07-30', 'game', null],
  [972660, 'Spiritfarer', 'Thunder Lotus Games', 'Thunder Lotus Games', 'Adventure, Indie', ['Cozy', 'Management', 'Emotional', 'Story Rich', 'Relaxing', '2D'], '1,000,000 .. 2,000,000', 40000, 1200, 800, 300, 2999, '2020-08-18', 'game', null],
  [433340, 'Slime Rancher', 'Monomi Park', 'Monomi Park', 'Casual, Indie', ['Cute', 'Farming Sim', 'Exploration', 'First-Person', 'Relaxing', 'Colorful'], '5,000,000 .. 10,000,000', 120000, 2500, 3000, 1500, 1999, '2017-08-01', 'game', null],
  [1455840, 'Dorfromantik', 'Toukana Interactive', 'Toukana Interactive', 'Casual, Strategy, Indie', ['Relaxing', 'City Builder', 'Puzzle', 'Casual', 'Strategy', 'Minimalist'], '500,000 .. 1,000,000', 20000, 500, 500, 400, 1499, '2022-04-28', 'game', null],
  // --- Visual Novel ---
  [698780, 'Doki Doki Literature Club!', 'Team Salvato', 'Team Salvato', 'Casual, Indie', ['Visual Novel', 'Psychological Horror', 'Anime', 'Story Rich', 'Free to Play', 'Dating Sim'], '5,000,000 .. 10,000,000', 250000, 6000, 3000, 700, 0, '2017-09-22', 'game', null],
  [412830, 'STEINS;GATE', 'MAGES. Inc.', 'Spike Chunsoft Co., Ltd.', 'Adventure', ['Visual Novel', 'Story Rich', 'Anime', 'Sci-fi', 'Time Travel', 'Choices Matter'], '1,000,000 .. 2,000,000', 30000, 600, 700, 400, 3499, '2016-09-08', 'game', null],
  [324160, 'CLANNAD', 'Key', 'VisualArts', 'Adventure', ['Visual Novel', 'Anime', 'Story Rich', 'Emotional', 'Romance', 'Dating Sim'], '500,000 .. 1,000,000', 15000, 400, 250, 200, 4999, '2015-11-23', 'game', null],
  [413410, 'Danganronpa: Trigger Happy Havoc', 'Spike Chunsoft Co., Ltd.', 'Spike Chunsoft Co., Ltd.', 'Adventure', ['Visual Novel', 'Mystery', 'Anime', 'Story Rich', 'Detective', 'Dark'], '1,000,000 .. 2,000,000', 40000, 900, 700, 300, 1999, '2016-02-18', 'game', null],
  [447530, 'VA-11 Hall-A: Cyberpunk Bartender Action', 'Sukeban Games', 'Ysbryd Games', 'Adventure, Indie', ['Visual Novel', 'Cyberpunk', 'Story Rich', 'Anime', 'Pixel Graphics'], '1,000,000 .. 2,000,000', 35000, 700, 400, 250, 1499, '2016-06-21', 'game', null],
  [787480, 'Phoenix Wright: Ace Attorney Trilogy', 'Capcom', 'Capcom', 'Adventure', ['Visual Novel', 'Detective', 'Story Rich', 'Comedy', 'Mystery'], '1,000,000 .. 2,000,000', 35000, 600, 900, 500, 2999, '2019-04-09', 'game', null],
  // --- Indie / puzzle / narrative ---
  [239030, 'Papers, Please', 'Lucas Pope', '3909', 'Indie', ['Dystopian', 'Puzzle', 'Indie', 'Political', 'Story Rich'], '2,000,000 .. 5,000,000', 90000, 2000, 2000, 700, 999, '2013-08-08', 'game', null],
  [653530, 'Return of the Obra Dinn', 'Lucas Pope', '3909', 'Adventure, Indie', ['Detective', 'Mystery', 'Puzzle', 'Story Rich', 'First-Person'], '1,000,000 .. 2,000,000', 45000, 1200, 700, 400, 1999, '2018-10-18', 'game', null],
  [753640, 'Outer Wilds', 'Mobius Digital', 'Annapurna Interactive', 'Adventure, Indie', ['Exploration', 'Space', 'Mystery', 'Story Rich', 'Physics', 'Atmospheric'], '2,000,000 .. 5,000,000', 130000, 4000, 3000, 1200, 2499, '2020-06-18', 'game', null],
  [210970, 'The Witness', 'Thekla, Inc.', 'Thekla, Inc.', 'Adventure, Indie', ['Puzzle', 'Exploration', 'First-Person', 'Open World', 'Difficult'], '2,000,000 .. 5,000,000', 50000, 3000, 900, 500, 3999, '2016-01-26', 'game', null],
  [736260, 'Baba Is You', 'Hempuli Oy', 'Hempuli Oy', 'Indie', ['Puzzle', 'Logic', 'Pixel Graphics', 'Difficult', 'Minimalist', '2D'], '1,000,000 .. 2,000,000', 35000, 700, 900, 400, 1499, '2019-03-13', 'game', null],
  [257510, 'The Talos Principle', 'Croteam', 'Devolver Digital', 'Adventure, Indie', ['Puzzle', 'First-Person', 'Philosophical', 'Sci-fi', 'Atmospheric', 'Singleplayer'], '2,000,000 .. 5,000,000', 45000, 1500, 800, 400, 3999, '2014-12-11', 'game', null],
  [304430, 'INSIDE', 'Playdead', 'Playdead', 'Action, Adventure, Indie', ['Puzzle', 'Platformer', 'Dark', 'Atmospheric', '2D', 'Short'], '2,000,000 .. 5,000,000', 90000, 2000, 1200, 300, 1999, '2016-07-07', 'game', null],
  [48000, 'LIMBO', 'Playdead', 'Playdead', 'Action, Adventure, Indie', ['Puzzle', 'Platformer', 'Dark', 'Atmospheric', '2D', 'Short'], '5,000,000 .. 10,000,000', 120000, 3500, 1500, 250, 999, '2011-08-02', 'game', null],
  [383870, 'Firewatch', 'Campo Santo', 'Campo Santo', 'Adventure, Indie', ['Walking Simulator', 'Story Rich', 'Atmospheric', 'Exploration', 'First-Person', 'Short'], '2,000,000 .. 5,000,000', 70000, 3000, 1500, 300, 1999, '2016-02-09', 'game', null],
  [683320, 'GRIS', 'Nomada Studio', 'Devolver Digital', 'Adventure, Indie', ['Beautiful', 'Atmospheric', 'Emotional', '2D', 'Short', 'Great Soundtrack'], '1,000,000 .. 2,000,000', 45000, 800, 500, 200, 1699, '2018-12-13', 'game', null],
  [1003590, 'Tetris Effect: Connected', 'Monstars Inc., Resonair, Stage Games', 'Enhance', 'Casual', ['Puzzle', 'Music', 'Casual', 'Multiplayer', 'Colorful'], '500,000 .. 1,000,000', 12000, 400, 300, 250, 3999, '2021-08-18', 'game', null],
  [477160, 'Human: Fall Flat', 'No Brakes Games', 'Curve Games', 'Adventure, Casual, Indie', ['Physics', 'Co-op', 'Funny', 'Multiplayer', 'Puzzle', 'Platformer'], '20,000,000 .. 50,000,000', 250000, 12000, 4000, 800, 1999, '2016-07-22', 'game', null],
  [728880, 'Overcooked! 2', 'Ghost Town Games Ltd.', 'Team17', 'Casual, Indie', ['Co-op', 'Multiplayer', 'Funny', 'Cooking', 'Local Co-Op', 'Casual'], '2,000,000 .. 5,000,000', 60000, 4000, 1500, 900, 2499, '2018-08-07', 'game', null],
  [837470, 'Untitled Goose Game', 'House House', 'Panic', 'Casual, Indie', ['Comedy', 'Casual', 'Puzzle', 'Funny', 'Cute'], '2,000,000 .. 5,000,000', 50000, 1200, 700, 250, 1999, '2019-09-20', 'game', null],
];

// 低データ枠 (小惑星になる想定: タグ/詳細なし、実在appid)
const SPARSE = [
  [22000, 'World of Goo', '2D BOY', '2D BOY', 25000, 600],
  [12900, 'AudioSurf', 'Dylan Fitterer', 'Dylan Fitterer', 12000, 400],
  [70300, 'VVVVVV', 'Terry Cavanagh', 'Terry Cavanagh', 11000, 400],
  [40800, 'Super Meat Boy', 'Team Meat', 'Team Meat', 50000, 2500],
  [26800, 'Braid', 'Number None', 'Number None', 15000, 600],
  [29180, 'Osmos', 'Hemisphere Games', 'Hemisphere Games', 5000, 200],
  [40700, 'Machinarium', 'Amanita Design', 'Amanita Design', 18000, 500],
  [41500, 'Torchlight', 'Runic Games', 'Runic Games', 9000, 400],
  [200710, 'Torchlight II', 'Runic Games', 'Runic Games', 40000, 2000],
  [107100, 'Bastion', 'Supergiant Games', 'Supergiant Games', 40000, 900],
  [237930, 'Transistor', 'Supergiant Games', 'Supergiant Games', 35000, 900],
  [462770, 'Pyre', 'Supergiant Games', 'Supergiant Games', 9000, 300],
  [236090, 'Dust: An Elysian Tail', 'Humble Hearts', 'Humble Hearts', 20000, 500],
  [214560, 'Mark of the Ninja', 'Klei Entertainment', 'Klei Entertainment', 25000, 600],
  [241600, 'Rogue Legacy', 'Cellar Door Games', 'Cellar Door Games', 30000, 900],
  [239350, 'Spelunky', 'Mossmouth', 'Mossmouth', 15000, 800],
  [224760, 'FEZ', 'Polytron Corporation', 'Polytron Corporation', 15000, 800],
  [221910, 'The Stanley Parable', 'Galactic Cafe', 'Galactic Cafe', 60000, 1500],
  [219890, 'Antichamber', 'Alexander Bruce', 'Alexander Bruce', 15000, 500],
  [220780, 'Thomas Was Alone', 'Mike Bithell', 'Mike Bithell', 10000, 400],
  [49600, 'Beat Hazard', 'Cold Beam Games', 'Cold Beam Games', 8000, 300],
];

const db = openDb();
const now = nowIso();
const insAll = db.prepare(`INSERT OR REPLACE INTO raw_steamspy_all(appid,page,json,fetched_at,data_source)
  VALUES(?,?,?,?,'sample_curated')`);
const insSpy = db.prepare(`INSERT OR REPLACE INTO raw_steamspy_detail(appid,json,fetched_at,data_source)
  VALUES(?,?,?,'sample_curated')`);
const insStore = db.prepare(`INSERT OR REPLACE INTO raw_store_detail(appid,json,success,fetched_at,data_source)
  VALUES(?,?,1,?,'sample_curated')`);

db.exec('BEGIN');
for (const [id, title, dev, pub, genre, tags, owners, pos, neg, ccu, avg, price, date, type, fullgame] of ROWS) {
  const base = {
    appid: id, name: title, developer: dev, publisher: pub,
    positive: pos, negative: neg, owners,
    average_forever: avg, average_2weeks: Math.min(600, Math.round(avg / 15)),
    median_forever: Math.round(avg * 0.6), price: String(price), initialprice: String(price),
    ccu,
  };
  insAll.run(id, 0, JSON.stringify(base), now);
  if (tags) {
    const tagObj = Object.fromEntries(tags.map((t, i) => [t, 1000 - i * 60]));
    insSpy.run(id, JSON.stringify({ ...base, genre, tags: tagObj }), now);
  }
  insStore.run(id, JSON.stringify({
    type: type || 'game', name: title, is_free: price === 0,
    release_date: date ? { coming_soon: false, date } : undefined,
    developers: [dev], publishers: [pub],
    genres: genre.split(',').map((s) => s.trim()),
    fullgame: fullgame ? { appid: String(fullgame), name: '' } : undefined,
  }), now);
}
for (const [id, title, dev, pub, pos, neg] of SPARSE) {
  insAll.run(id, 9, JSON.stringify({
    appid: id, name: title, developer: dev, publisher: pub,
    positive: pos, negative: neg, owners: '1,000,000 .. 2,000,000',
    average_forever: 300, average_2weeks: 5, median_forever: 180,
    price: '999', initialprice: '999', ccu: 40,
  }), now);
}
db.exec('COMMIT');
console.log(`seeded: ${ROWS.length} curated + ${SPARSE.length} sparse`);
