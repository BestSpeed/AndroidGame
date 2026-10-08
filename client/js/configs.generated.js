// ⚠️ تولیدشده با: npm run build:configs — دستی تغییر ندهید.
// منبع: پوشهٔ configs/ (کانفیگ‌های Data-Driven سرور و کلاینت مشترک‌اند)
export const CONFIGS = {
 "achievements": {
  "list": [
   {
    "id": "first_win",
    "name": {
     "fa": "اولین برد",
     "en": "First Win"
    },
    "icon": "🏆",
    "goal": 1,
    "stat": "wins",
    "xp": 50,
    "coins": 100
   },
   {
    "id": "matches_10",
    "name": {
     "fa": "ده مسابقه",
     "en": "10 Matches"
    },
    "icon": "🎮",
    "goal": 10,
    "stat": "matches",
    "xp": 80,
    "coins": 150
   },
   {
    "id": "wins_5",
    "name": {
     "fa": "پنج برد",
     "en": "5 Wins"
    },
    "icon": "⭐",
    "goal": 5,
    "stat": "wins",
    "xp": 120,
    "coins": 250
   },
   {
    "id": "snake_survivor",
    "name": {
     "fa": "مارِ جون‌سخت",
     "en": "Tough Snake"
    },
    "icon": "🐍",
    "goal": 1,
    "stat": "snakeWins",
    "xp": 60,
    "coins": 120
   }
  ]
 },
 "app": {
  "name": {
   "fa": "بازی‌خونه",
   "en": "BAZIKHUNEH"
  },
  "defaultLang": "fa",
  "supportedLangs": [
   "fa",
   "en"
  ],
  "portrait": true,
  "tutorial": {
   "steps": 3,
   "rewardCoins": 100,
   "rewardXp": 30
  },
  "reconnect": {
   "baseDelayMs": 1000,
   "maxDelayMs": 15000,
   "factor": 2
  },
  "features": {
   "voiceChat": false,
   "clans": false,
   "trading": false,
   "rankedSeasons": false,
   "battlePass": false
  }
 },
 "bots": {
  "namePrefix": "🤖",
  "names": [
   "رضا",
   "سارا",
   "نیما",
   "لیلا",
   "آرش",
   "مینا",
   "پویا",
   "شیرین",
   "کاوه",
   "نرگس",
   "بابک",
   "یاسمن"
  ],
  "avatars": [
   "🤖",
   "👾",
   "🦾",
   "🎯"
  ],
  "difficulties": {
   "easy": {
    "reactionMs": [
     620,
     950
    ],
    "errorRate": 0.24,
    "snakeMistakeRate": 0.18,
    "raceAccuracy": 0.55,
    "boostIQ": 0.3
   },
   "normal": {
    "reactionMs": [
     420,
     700
    ],
    "errorRate": 0.13,
    "snakeMistakeRate": 0.08,
    "raceAccuracy": 0.75,
    "boostIQ": 0.6
   },
   "hard": {
    "reactionMs": [
     260,
     450
    ],
    "errorRate": 0.05,
    "snakeMistakeRate": 0.02,
    "raceAccuracy": 0.9,
    "boostIQ": 0.9
   }
  },
  "fillMix": [
   "easy",
   "normal",
   "normal",
   "hard"
  ]
 },
 "daily": {
  "rotation": [
   "reaction"
  ],
  "reaction": {
   "durationSec": 30,
   "targets": [
    800,
    1100,
    1400,
    1800
   ],
   "pickTargetIndexByDay": true,
   "rewardCoins": 150,
   "rewardXp": 50,
   "maxAttempts": 3
  }
 },
 "economy": {
  "xp": {
   "levelBase": 100,
   "levelExp": 1.6,
   "maxLevel": 100,
   "sources": {
    "matchComplete": 40,
    "win": 60,
    "topHalf": 25,
    "dailyChallenge": 50,
    "tutorial": 30
   }
  },
  "coins": {
   "starters": 300,
   "matchByRank": [
    120,
    90,
    70,
    55,
    45,
    35,
    30,
    25
   ],
   "winBonus": 40,
   "tutorial": 100,
   "dailyReward": [
    50,
    75,
    100,
    125,
    150,
    200,
    300
   ]
  },
  "gems": {
   "starters": 0
  },
  "trophies": {
   "byRank": [
    24,
    14,
    8,
    2,
    -2,
    -6,
    -10,
    -14
   ],
   "min": 0
  },
  "ads": {
   "doubleCoinsMultiplier": 2,
   "rewardedCooldownSec": 90,
   "dailyCap": 8,
   "interstitialEveryNMatches": 3
  }
 },
 "emotes": {
  "emotes": [
   "😂",
   "😎",
   "😱",
   "😭",
   "🔥",
   "👏",
   "🤔",
   "😜"
  ],
  "phrases": [
   "phrase.again",
   "phrase.mine",
   "phrase.what",
   "phrase.luck",
   "phrase.gg"
  ],
  "maxPerMatch": 20
 },
 "games": {
  "ReactionGame": {
   "name": "دست‌به‌کار",
   "durationSec": 45,
   "firstCardDelayMs": 1500,
   "cardShowMsStart": 1100,
   "cardShowMsMin": 700,
   "cardShowMsDecayPerCard": 8,
   "gapMsMin": 300,
   "gapMsMax": 650,
   "ruleChangeEvery": [
    4,
    7
   ],
   "tapRatio": 0.55,
   "score": {
    "correctTap": 100,
    "speedBonusMax": 50,
    "correctHold": 60,
    "wrongTap": -80,
    "missedTap": -40,
    "lockoutMs": 500,
    "comboAfter": 5,
    "comboBonusPerStep": 10,
    "comboBonusMax": 50
   },
   "minHumanReactionMs": 150,
   "colors": [
    "red",
    "blue",
    "green",
    "yellow"
   ],
   "shapes": [
    "circle",
    "square",
    "triangle",
    "star"
   ]
  },
  "SnakeArena": {
   "name": "مار محله",
   "gridW": 24,
   "gridH": 32,
   "tickMs": 125,
   "speedCellsPerSec": 6,
   "foodCount": 6,
   "foodScore": 10,
   "survivalScorePerSec": 2,
   "maxDurationSec": 90,
   "suddenDeathAtSec": 75,
   "suddenDeathShrinkEverySec": 2,
   "maxInputsPerSec": 10
  },
  "StreetRace": {
   "name": "مسابقه کوچه",
   "tickMs": 83,
   "maxDurationSec": 60,
   "baseSpeed": 220,
   "steerSpeed": 2.2,
   "boostMultiplier": 1.55,
   "boostDrainPerSec": 42,
   "boostRegenPerSec": 16,
   "crashSlowdownMs": 1100,
   "crashSpeedFactor": 0.35,
   "shortcutBonus": 160,
   "tracks": [
    {
     "id": "kooche_sefid",
     "name": "کوچه صیفی",
     "length": 3400,
     "obstacleDensity": 0.8,
     "shortcutEvery": 700,
     "seed": 11
    },
    {
     "id": "khiyaban_paqaleh",
     "name": "خیابون پاقلعه",
     "length": 3800,
     "obstacleDensity": 1,
     "shortcutEvery": 620,
     "seed": 22
    },
    {
     "id": "bolvar_bagh",
     "name": "بلوار باغ",
     "length": 4200,
     "obstacleDensity": 1.15,
     "shortcutEvery": 560,
     "seed": 33
    }
   ]
  }
 },
 "match": {
  "players": {
   "min": 2,
   "max": 8,
   "target": 8
  },
  "rounds": 3,
  "countdownSec": 3,
  "roundIntroSec": 4,
  "roundResultSec": 5,
  "finalResultSec": 0,
  "rematchWindowSec": 20,
  "disconnectGraceSec": 30,
  "roundRotation": [
   "ReactionGame",
   "SnakeArena",
   "StreetRace"
  ],
  "elimination": {
   "mode": "score-based",
   "note": "نمایشی: خط حذف پس از هر راند نمایش می‌شود اما کسی بیکار نمی‌ماند (تصمیم طراحی — نکات معماری)",
   "cutAfterRound": [
    2,
    2
   ]
  }
 },
 "matchmaking": {
  "targetSize": 8,
  "minStartSize": 2,
  "skillBaseRange": 150,
  "skillExpandPerSec": 40,
  "botFillAfterSec": 5,
  "maxQueueSec": 12,
  "queueTickMs": 1000
 },
 "shop": {
  "items": [
   {
    "id": "av_gol",
    "type": "avatar",
    "rarity": "common",
    "price": 150,
    "currency": "coins",
    "asset": "🌸",
    "name": {
     "fa": "آواتار گل",
     "en": "Flower Avatar"
    },
    "desc": {
     "fa": "یه گل خوشگل برای پروفایلت",
     "en": "A lovely flower for your profile"
    }
   },
   {
    "id": "av_khorus",
    "type": "avatar",
    "rarity": "common",
    "price": 150,
    "currency": "coins",
    "asset": "🐓",
    "name": {
     "fa": "خروس محل",
     "en": "Rooster"
    },
    "desc": {
     "fa": "سحرخیز باش!",
     "en": "Rise and shine!"
    }
   },
   {
    "id": "av_mushak",
    "type": "avatar",
    "rarity": "rare",
    "price": 400,
    "currency": "coins",
    "asset": "🚀",
    "name": {
     "fa": "موشک",
     "en": "Rocket"
    },
    "desc": {
     "fa": "برای سرعتی‌ها",
     "en": "For the fast ones"
    }
   },
   {
    "id": "av_ghuri",
    "type": "avatar",
    "rarity": "rare",
    "price": 400,
    "currency": "coins",
    "asset": "🫖",
    "name": {
     "fa": "قوری نوستالژی",
     "en": "Teapot"
    },
    "desc": {
     "fa": "چای ذغالی یادت نره",
     "en": "Never forget the samovar"
    }
   },
   {
    "id": "av_azhdaha",
    "type": "avatar",
    "rarity": "epic",
    "price": 900,
    "currency": "coins",
    "asset": "🐉",
    "name": {
     "fa": "اژدها",
     "en": "Dragon"
    },
    "desc": {
     "fa": "ابهیتم رو به رخ بکش",
     "en": "Show your power"
    }
   },
   {
    "id": "fr_gold",
    "type": "frame",
    "rarity": "epic",
    "price": 1200,
    "currency": "coins",
    "asset": "gold",
    "name": {
     "fa": "قاب طلایی",
     "en": "Gold Frame"
    },
    "desc": {
     "fa": "قاب دور آواتار",
     "en": "Avatar frame"
    }
   },
   {
    "id": "fr_neon",
    "type": "frame",
    "rarity": "rare",
    "price": 600,
    "currency": "coins",
    "asset": "neon",
    "name": {
     "fa": "قاب نئونی",
     "en": "Neon Frame"
    },
    "desc": {
     "fa": "شب‌نما",
     "en": "Glow in the dark"
    }
   },
   {
    "id": "em_cheeky",
    "type": "emote",
    "rarity": "common",
    "price": 200,
    "currency": "coins",
    "asset": "😜",
    "name": {
     "fa": "ایول!",
     "en": "Cheeky"
    },
    "desc": {
     "fa": "ایموت ویژه",
     "en": "Special emote"
    }
   },
   {
    "id": "pack_coins_s",
    "type": "pack",
    "rarity": "common",
    "price": 10,
    "currency": "gems",
    "asset": "coins",
    "amount": 500,
    "name": {
     "fa": "بسته ۵۰۰ سکه",
     "en": "500 Coins"
    },
    "desc": {
     "fa": "۵۰۰ سکه",
     "en": "500 coins"
    }
   },
   {
    "id": "pack_gems_s",
    "type": "pack",
    "rarity": "common",
    "price": 2,
    "currency": "iap",
    "asset": "gems",
    "amount": 100,
    "priceIap": {
     "fa": "۹۹٬۰۰۰ تومان",
     "en": "$0.99"
    },
    "name": {
     "fa": "بسته ۱۰۰ جم",
     "en": "100 Gems"
    },
    "desc": {
     "fa": "۱۰۰ جم",
     "en": "100 gems"
    }
   },
   {
    "id": "pack_gems_m",
    "type": "pack",
    "rarity": "rare",
    "price": 5,
    "currency": "iap",
    "asset": "gems",
    "amount": 550,
    "priceIap": {
     "fa": "۳۹۹٬۰۰۰ تومان",
     "en": "$3.99"
    },
    "name": {
     "fa": "بسته ۵۵۰ جم",
     "en": "550 Gems"
    },
    "desc": {
     "fa": "۵۵۰ جم + ۱۰٪ هدیه",
     "en": "550 gems +10% bonus"
    }
   }
  ]
 }
};
