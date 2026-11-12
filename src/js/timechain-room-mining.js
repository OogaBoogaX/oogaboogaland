// Room 7, the Mining Museum: how the work moved from hobby desktops to warehouses, and why today's hardware does
// about a million times more hashes per joule than in 2009. The dome is seventeen years of network hashrate on a log
// scale wrapped round the room, from 2009 by the door on the left to today on the right, shaded by era (CPU, GPU,
// FPGA, ASIC) right over that era's exhibits, the hash units labelled over the door where the chart starts and ends;
// the crown spells today's rate out, live from mempool.space when it can read it. Nineteen exhibits stand round a ring
// in date order, each a model (1.6 times life size) on a plinth with its plaque, the floor's ring ticked for every year
// right under that year's tick on the dome; a tap, or Space in front of one,
// opens it in the model viewer (`model-viewer.js`), up close in 3D beside all its stats and sources. Satoshi's
// machine is the one Sergio Demian Lerner's Patoshi research points to: a single high-end 2009 desktop, its CPU
// sweeping five nonce ranges at once. A big S21 turns slowly on a plinth in the middle.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms, P = RM.paintKit;
  const { box, merge } = BL.models;
  const { own } = RM.helpers;
  const C = {
    amber: "#f7931a", amberText: "#ffb04d", glow: "#ffc93c", glowText: "#ffd66b", white: "#f4efe6", grey: "#a89c8b", ink: "#14110e",
    alu: "#b8bec6", dark: "#1c1e22", beige: "#cfc6b0", pcb: "#1f6b3a", chip: "#111111", fanPlate: "#2a2d32", fanHole: "#0d0e10",
    blade: "#41454c", hub: "#7a8089", led: "#3ce07a", cable: "#1d6fd6", label: "#e8e8ea",
    boss: "#17191c", sticker: "#e2ddd0", guard: "#5f646b", screw: "#5d636b"
  };

  // ---------- what the museum says (checked against Sergio Demian Lerner's research for Satoshi's machine, the Bitcoin
  // Wiki's hardware tables, the makers' specifications and mempool.space's hashrate history) ----------
  // Each exhibit: its year (placing it on the ring and the dome), the plaque's title, name, line and three stats, its
  // joules a terahash for the plaque's efficiency scale (none for the pool, which is an idea, not a machine), and for
  // the viewer a longer account (`about`), all its stats (`specs`), a note and its sources.
  const SRC = {
    lerner: { href: "https://bitslog.com/2020/08/22/the-patoshi-mining-machine/", label: "Lerner · The Patoshi Mining Machine (2020)" },
    deniers: { href: "https://bitslog.com/2019/04/16/the-return-of-the-deniers-and-the-revenge-of-patoshi/", label: "Lerner · The Revenge of Patoshi (2019)" },
    gpu: { href: "https://en.bitcoin.it/wiki/Non-specialized_hardware_comparison", label: "Bitcoin Wiki · non-specialized hardware" },
    hw: { href: "https://en.bitcoin.it/wiki/Mining_hardware_comparison", label: "Bitcoin Wiki · mining hardware" },
    avalon: { href: "https://en.bitcoin.it/wiki/Avalon1", label: "Bitcoin Wiki · Avalon1" },
    erupter: { href: "https://bitcoinmagazine.com/business/btcguild-starts-selling-asicminer-usbs-sells-out-in-40-minutes-1372542639", label: "Bitcoin Magazine · BTC Guild sells out ASICMiner's USBs in 40 minutes (2013)" },
    asicminer: { href: "https://en.bitcoin.it/wiki/ASICMiner", label: "Bitcoin Wiki · ASICMiner" },
    s3: { href: "https://www.coindesk.com/markets/2014/06/30/bitmain-releases-energy-efficient-478ghs-antminer-s3", label: "CoinDesk · Bitmain releases the 478 GH/s AntMiner S3 (2014)" },
    s7: { href: "https://www.asicminervalue.com/miners/bitmain/antminer-s7", label: "ASIC Miner Value · Antminer S7" },
    s21: { href: "https://support.bitmain.com/hc/en-us/articles/23794895251609-S21-Specification", label: "Bitmain · S21 specification" },
    m3: { href: "https://www.asicminervalue.com/miners/microbt/whatsminer-m3", label: "ASIC Miner Value · WhatsMiner M3" },
    s15: { href: "https://www.asicminervalue.com/miners/bitmain/antminer-s15-28th", label: "ASIC Miner Value · Antminer S15" },
    m50s: { href: "https://hashrateindex.com/blog/hardware-overview-microbts-whatsminer-m50s-series/", label: "Hashrate Index · WhatsMiner M50S series" },
    xp19: { href: "https://www.asicminervalue.com/miners/bitmain/antminer-s19-xp", label: "ASIC Miner Value · Antminer S19 XP" },
    proto: { href: "https://proto.xyz/products/rig", label: "Proto · Rig specifications" },
    protoReview: { href: "https://hashrateindex.com/blog/proto-rig-review-blocks-open-source-revolution-challenges-bitcoin-minings-status-quo/", label: "Hashrate Index · Proto Rig review" },
    xp: { href: "https://support.bitmain.com/hc/en-us/articles/34523540504857-S21-XP-Hyd-Specification", label: "Bitmain · S21 XP Hyd specification" },
    hashrate: { href: "https://mempool.space/graphs/mining/hashrate-difficulty", label: "mempool.space · network hashrate" }
  };
  const MINERS = [
    { year: 2009.1, title: "CPU", name: "Satoshi's computer", model: "cpu", jth: 2e7,
      text: "One high-end 2009 CPU, five threads at once.",
      stats: [["Hashrate", "~7-20 MH/s"], ["Power", "~200 W"], ["J/TH", "~10-29 million"]],
      about: "Sergio Demian Lerner found the Patoshi pattern in the earliest blocks, the miner most think was Satoshi. In 2020 he showed it swept five nonce ranges in parallel, each in order, rarely touching the timestamp: multi-threading on one machine, not some fifty PCs. A single high-end desktop or server of 2009 running a tuned miner could have mined every Patoshi block, and his own test CPU runs about as fast as the Intel Core i7-965 Extreme, 2009's fastest desktop chip. He links Patoshi to Satoshi by evidence, not proof.",
      specs: [["Processor", "Intel Core i7-965 Extreme class (Nehalem, 45 nm)"], ["Cores", "4 cores, 8 threads, 3.2 GHz"], ["Mining", "5 threads, each sweeping its own fifth of the nonces"], ["Hashrate", "~7 MH/s plain, ~20 MH/s with 4-way SSE2"], ["Lerner's test", "a difficulty-1 block every 619 s, 219 s with SSE2"], ["CPU power", "130 W (TDP); the PC ~200 W"], ["Network, 2009", "about 5 MH/s in all"], ["Machines", "one, by Lerner's reading"]],
      note: "Hashrates worked out from Lerner's benchmark times, at 2^32 hashes a difficulty-1 block. The model is a high-end 2009 desktop running Bitcoin 0.1.", sources: [SRC.lerner, SRC.deniers, SRC.hashrate] },
    { year: 2010.6, title: "GPU", name: "Radeon HD 5870 rig", model: "gpu", jth: 4.7e5,
      text: "Graphics cards took over in 2010. Tuned, one Radeon HD 5870 hashed about 400 MH/s.",
      stats: [["Per card", "~400 MH/s"], ["Power", "188 W"], ["J/TH", "~470,000"]],
      about: "OpenCL miners in 2010 put SHA-256 on a graphics card's 1,600 simple cores. Rigs of four or more cards on an open frame, fed by riser cables, outhashed the whole 2009 network hundreds of times over, and mining moved from the desktop to the spare room.",
      specs: [["Card", "ATI Radeon HD 5870 (Cypress, 40 nm, 2009)"], ["Cores", "1,600 stream processors, 850 MHz"], ["Hashrate", "313-481 MH/s by miner and clocks"], ["Board power", "188 W"], ["This rig", "4 cards: ~1.6 GH/s on ~900 W"], ["Miners", "poclbm, Phoenix, DiabloMiner"]],
      note: "Hashrates from the Bitcoin Wiki's table of measured results.", sources: [SRC.gpu] },
    { year: 2010.95, title: "POOLS", name: "Mining pools", model: "pool", jth: null,
      text: "Slush's pool found its first block in December 2010: miners share the work and split the reward for steadier pay.",
      stats: [],
      paragraph: "Alone, a small miner could wait months for a block. In a pool everyone works on the same block and proves their part with shares, easier near-misses; whoever finds it, the reward is split by shares, so pay comes small and steady. Nearly all hashrate mines in pools today.",
      about: "Alone, a small miner could wait months for a block. A pool hands everyone the same block to work on and counts easier near-misses, shares, as proof of each one's work; when anyone finds the block, the reward is split by shares. Slush's pool was the first, in late 2010.",
      specs: [["First", "Slush's pool, first block December 2010"], ["Shares", "easier hashes that prove the work"], ["Pay", "each reward split by shares"], ["Today", "nearly all hashrate mines in pools"]],
      note: "A pool is an idea, not a machine: here a rack of servers and its switch.", sources: [] },
    { year: 2011.75, title: "FPGA", name: "X6500 FPGA miner", model: "fpga", jth: 4.3e4,
      text: "Two programmable Spartan-6 chips: a graphics card's hashrate on a tenth of its power.",
      stats: [["Hashrate", "400 MH/s"], ["Power", "17.2 W"], ["J/TH", "~43,000"]],
      about: "FPGAs are chips whose logic is wired by a program. Wired for SHA-256 and nothing else, two of them matched a graphics card's hashrate on the power of a light bulb, the first step from general-purpose hardware toward chips made only to mine.",
      specs: [["Chips", "2 × Xilinx Spartan-6 LX150 FPGA"], ["Hashrate", "400 MH/s"], ["Power", "17.2 W"], ["Efficiency", "23 MH/J"], ["Price", "$550 (2011)"]],
      note: "Figures from the Bitcoin Wiki's mining hardware table.", sources: [SRC.hw] },
    { year: 2013.05, title: "ASIC", name: "Avalon Batch 1", model: "avalon", jth: 9400,
      text: "The first miner on chips made only for SHA-256, shipped in January 2013.",
      stats: [["Hashrate", "66.3 GH/s"], ["Power", "620 W"], ["J/TH", "~9,400"]],
      about: "An ASIC does one thing. Avalon's A3256, made at 110 nm, was the first Bitcoin ASIC on sale, and its first batch of miners shipped in January 2013: one box that outhashed a room of graphics cards. From here on, only chips made to mine could keep up.",
      specs: [["Hashrate", "66.3 GH/s"], ["Power", "620 W at the wall"], ["Efficiency", "~9.4 J/GH (~9,400 J/TH)"], ["Chips", "A3256, 110 nm (TSMC)"], ["Price", "$1,299"], ["First shipped", "January 2013"]],
      note: "Figures from the Bitcoin Wiki; model 1.6 times life size, unplugged, its cords lying behind it.", sources: [SRC.hw, SRC.avalon] },
    { year: 2013.48, title: "USB ASIC", name: "Block Erupter USB", model: "erupter", jth: 7600,
      text: "An ASIC on a USB stick: a third of a gigahash from any spare port.",
      stats: [["Hashrate", "336 MH/s"], ["Power", "~2.55 W"], ["J/TH", "~7,600"]],
      about: "ASICMiner put its own 130 nm chip on a USB stick, powered from the port it plugged into and cooled by its own heatsink. When BTC Guild offered a thousand of them at 1 BTC each in June 2013, they sold out in forty minutes. Plugged by the handful into powered hubs, with a desk fan blowing across them, they brought ASIC mining to anyone with a laptop.",
      specs: [["Hashrate", "336 MH/s"], ["Power", "~2.55 W from the USB port"], ["Efficiency", "~7.6 J/GH (~7,600 J/TH)"], ["Chip", "ASICMiner's own, 130 nm"], ["Price", "1 BTC (June 2013)"], ["Shown", "7 sticks in a powered hub: ~2.35 GH/s"]],
      note: "Figures from the Bitcoin Wiki and Bitcoin Magazine; model 1.6 times life size, seven sticks in a hub run from a 2013 laptop.", sources: [SRC.erupter, SRC.hw, SRC.asicminer] },
    { year: 2014.5, title: "S3", name: "Antminer S3", model: "s3", jth: 770,
      text: "Half a terahash on the power of a few light bulbs.",
      stats: [["Hashrate", "478 GH/s"], ["Power", "366 W"], ["J/TH", "~770"]],
      about: "Bitmain's S3 shipped in July 2014: 32 of its BM1382 chips in a small aluminium box with a fan at each end, run from an ordinary ATX power supply its owner brought. It was the box many home miners ran through the long bear market of 2014 and 2015.",
      specs: [["Hashrate", "478 GH/s (±5%)"], ["Power", "366 W at the wall"], ["Efficiency", "~0.77 J/GH (~770 J/TH)"], ["Chips", "32 × BM1382 (28 nm)"], ["Size", "331 × 137 × 160 mm"], ["Power supply", "standard ATX, not included"], ["Released", "July 2014"]],
      note: "From Bitmain's launch specification; model 1.6 times life size, an ATX power supply beside it.", sources: [SRC.s3, SRC.hw] },
    { year: 2015.7, title: "S7", name: "Antminer S7", model: "s7", jth: 273,
      text: "Ten times the S3 a year later, at a third of its joules a terahash.",
      stats: [["Hashrate", "4.73 TH/s"], ["Power", "1,293 W"], ["J/TH", "~273"]],
      about: "Bitmain's S7 of 2015 put 135 of its BM1385 chips on three hash boards in an aluminium case with a fan at each end and its APW3 power supply beside it: about ten times the S3's hashrate a year later, at about a third of its joules a terahash.",
      specs: [["Hashrate", "4.73 TH/s"], ["Power", "1,293 W"], ["Efficiency", "~273 J/TH"], ["Chips", "135 × BM1385 (28 nm)"], ["Size", "301 × 123 × 155 mm"], ["Weight", "3.9 kg"], ["Power supply", "separate (APW3)"], ["Released", "2015"]],
      note: "Figures as commonly listed from Bitmain's specification; model 1.6 times life size.", sources: [SRC.s7, SRC.hw] },
    { year: 2016.4, title: "S9", name: "Antminer S9", model: "s9", jth: 98,
      text: "The workhorse of its era, still hashing in places years later.",
      stats: [["Hashrate", "14 TH/s"], ["Power", "1,375 W"], ["J/TH", "98"]],
      about: "Bitmain's S9 sold in vast numbers from 2016: three hash boards in an aluminium shell, a fan at each end and a power supply beside it. It carried the network through the 2017 run and kept hashing wherever power was cheap long after.",
      specs: [["Hashrate", "13.5-14 TH/s"], ["Power", "~1,375 W"], ["Efficiency", "~98 J/TH"], ["Chips", "189 × BM1387 (16 nm)"], ["Size", "350 × 135 × 158 mm"], ["Weight", "4.2 kg"], ["Power supply", "separate (APW3)"], ["Released", "2016"]],
      note: "Model 1.6 times life size, its power supply beside it.", sources: [SRC.hw] },
    { year: 2018.05, title: "M3", name: "WhatsMiner M3", model: "m3", jth: 167,
      text: "A new rival to the S9: 12 TH/s from MicroBT.",
      stats: [["Hashrate", "12 TH/s"], ["Power", "2,000 W"], ["J/TH", "~167"]],
      about: "MicroBT's WhatsMiner M3, on sale from early 2018, took on Bitmain's S9 with about 12 TH/s for about 2,000 W in a compact aluminium box with a fan at each end. The WhatsMiner line that followed made MicroBT Bitmain's biggest competitor.",
      specs: [["Hashrate", "~12 TH/s"], ["Power", "~2,000 W"], ["Efficiency", "~167 J/TH"], ["Size", "125 × 155 × 335 mm"], ["Weight", "8.1 kg"], ["Released", "early 2018"]],
      note: "Figures as listed by miner databases; model 1.6 times life size.", sources: [SRC.m3] },
    { year: 2018.95, title: "S15", name: "Antminer S15", model: "s15", jth: 57,
      text: "Bitmain's first 7 nm miner: 28 TH/s at 57 joules a terahash.",
      stats: [["Hashrate", "28 TH/s"], ["Power", "1,596 W"], ["J/TH", "57"]],
      about: "In December 2018 Bitmain brought 7 nm chips to mining with the S15: two S9s' worth of hashing in a box not much bigger, its power supply on top. The S17 took those chips further a few months later.",
      specs: [["Hashrate", "28 TH/s"], ["Power", "1,596 W"], ["Efficiency", "57 J/TH"], ["Chips", "288 × BM1391 (7 nm)"], ["Size", "176 × 221 × 279 mm"], ["Weight", "7 kg"], ["Power supply", "APW8, on top"], ["Released", "December 2018"]],
      note: "Figures from Bitmain's specification as commonly listed; model 1.6 times life size.", sources: [SRC.s15] },
    { year: 2019.3, title: "S17", name: "Antminer S17 Pro", model: "s17", jth: 39.5,
      text: "7 nm chips pass 50 TH/s in one box.",
      stats: [["Hashrate", "53 TH/s"], ["Power", "2,094 W"], ["J/TH", "39.5"]],
      about: "The S17 moved Bitmain to 7 nm chips and nearly quadrupled the S9's hashrate in a box hardly bigger, at under half its joules a terahash.",
      specs: [["Hashrate", "53 TH/s"], ["Power", "2,094 W"], ["Efficiency", "39.5 J/TH"], ["Chips", "BM1397 (7 nm)"], ["Size", "~298 × 178 × 296 mm"], ["Weight", "~9.5 kg"], ["Released", "2019"]],
      note: "Size and weight as commonly listed; model 1.6 times life size.", sources: [SRC.hw] },
    { year: 2020.4, title: "S19", name: "Antminer S19 Pro", model: "s19", jth: 29.5,
      text: "Over 100 TH/s, shipping around the 2020 halving.",
      stats: [["Hashrate", "110 TH/s"], ["Power", "3,250 W"], ["J/TH", "29.5"]],
      about: "The S19 Pro set the shape miners still have: a long box with two fans at each end and the power supply on top, past 100 TH/s for the first time.",
      specs: [["Hashrate", "110 TH/s"], ["Power", "3,250 W"], ["Efficiency", "29.5 J/TH"], ["Chips", "7 nm"], ["Size", "400 × 195.5 × 290 mm"], ["Weight", "13.2-14.4 kg"], ["Released", "2020"]],
      note: "Weight varies by batch; model 1.6 times life size.", sources: [SRC.hw] },
    { year: 2022.25, title: "M50S", name: "WhatsMiner M50S", model: "m50s", jth: 26,
      text: "126 TH/s from Bitmain's biggest rival.",
      stats: [["Hashrate", "126 TH/s"], ["Power", "3,276 W"], ["J/TH", "~26"]],
      about: "MicroBT's WhatsMiner line made it the other big name in mining hardware. Its M50S of 2022 put 126 TH/s in a long aluminium box with a big fan at each end and the power supply on top, at about 26 joules a terahash, and its + and ++ versions went faster still.",
      specs: [["Hashrate", "126 TH/s"], ["Power", "3,276 W (±5%)"], ["Efficiency", "~26 J/TH"], ["Variants", "M50S+ 136 TH/s, M50S++ 160 TH/s"], ["Size", "~430 × 155 × 240 mm"], ["Weight", "~12.5 kg"], ["Released", "2022"]],
      note: "Figures as listed by Hashrate Index and sellers; size varies by listing. Model 1.6 times life size.", sources: [SRC.m50s] },
    { year: 2022.55, title: "S19 XP", name: "Antminer S19 XP", model: "s19xp", jth: 21.5,
      text: "The S19's shape on 5 nm chips: 140 TH/s at 21.5 joules a terahash.",
      stats: [["Hashrate", "140 TH/s"], ["Power", "3,010 W"], ["J/TH", "21.5"]],
      about: "In 2022 Bitmain moved the S19 onto its 5 nm BM1366 chips: the same long box with two fans at each end and the power supply on top, now at 140 TH/s and the best efficiency of its generation, the step on the way to the S21.",
      specs: [["Hashrate", "140 TH/s"], ["Power", "~3,010 W"], ["Efficiency", "21.5 J/TH"], ["Chips", "BM1366 (5 nm)"], ["Size", "400 × 195 × 290 mm"], ["Weight", "~14.2-14.5 kg"], ["Released", "2022"]],
      note: "Figures as commonly listed; model 1.6 times life size.", sources: [SRC.xp19] },
    { year: 2023.85, title: "S21", name: "Antminer S21", model: "s21", jth: 17.5,
      text: "200 TH/s in one box, below 20 joules a terahash.",
      stats: [["Hashrate", "200 TH/s"], ["Power", "3,500 W"], ["J/TH", "17.5"]],
      about: "5 nm chips in the S19's shape: twice the hashrate, below 20 joules a terahash. One S21 outhashes the whole 2012 network about 13 times over.",
      specs: [["Hashrate", "200 TH/s"], ["Power", "3,500 W"], ["Efficiency", "17.5 J/TH"], ["Chips", "BM1368 (5 nm)"], ["Size", "400 × 195 × 290 mm"], ["Weight", "15.4 kg"], ["Released", "late 2023"]],
      note: "From Bitmain's specification; model 1.6 times life size.", sources: [SRC.s21] },
    { year: 2024.7, title: "BITAXE", name: "Bitaxe Gamma", model: "bitaxe", jth: 15,
      text: "An open-source home miner the size of a hand: one S21 Pro chip on the power of a desk lamp.",
      stats: [["Hashrate", "~1.2 TH/s"], ["Power", "~17-20 W"], ["J/TH", "~15"]],
      about: "Open hardware and open firmware: one of Bitmain's newest chips on a board the size of a hand, a little screen and Wi-Fi. Too small to earn much, it mines solo for the lottery of a whole block, and anyone can build one.",
      specs: [["Hashrate", "~1.2 TH/s"], ["Power", "~17-20 W"], ["Efficiency", "~15 J/TH"], ["Chip", "one BM1370 (the S21 Pro's)"], ["Controller", "ESP32-S3, Wi-Fi"], ["Firmware", "open source (AxeOS)"], ["Use", "solo mining at home"]],
      note: "Figures vary with tuning; model 1.6 times life size.", sources: [] },
    { year: 2024.9, title: "HYDRO", name: "Antminer S21 XP Hydro", model: "hydro", jth: 12,
      text: "Water-cooled for warehouses and heat reuse.",
      stats: [["Hashrate", "473 TH/s"], ["Power", "5,676 W"], ["J/TH", "12"]],
      about: "No fans: water through cold plates carries the heat away, quietly, to a dry cooler outside or to heat a building. Nearly half a petahash in a box, at 12 joules a terahash.",
      specs: [["Hashrate", "473 TH/s"], ["Power", "5,676 W"], ["Efficiency", "12.0 J/TH"], ["Cooling", "water, no fans"], ["Input", "380-415 V AC"], ["Size", "~410 × 170 × 209 mm"], ["Weight", "~13.8 kg"], ["Released", "2024"]],
      note: "Power and hashrate from Bitmain; size and weight as listed by sellers.", sources: [SRC.xp] },
    { year: 2025.62, title: "PROTO", name: "Proto Rig", model: "proto", jth: 14.1,
      text: "Block's modular miner: nine hashboards that swap out on the rack in under 90 seconds.",
      stats: [["Hashrate", "819 TH/s"], ["Power", "12,000 W"], ["J/TH", "14.1"]],
      about: "Block's Proto Rig, revealed in August 2025, is built to be repaired and upgraded rather than thrown away: nine hashboards, three fanless power supplies, six fans and the control board each come out by hand on the rack, so a miner can keep the chassis and change only the boards as chips improve.",
      specs: [["Hashrate", "up to 819 TH/s (91 TH/s a board)"], ["Power", "up to 12,000 W"], ["Efficiency", "as low as 14.1 J/TH"], ["Hashboards", "9, replaceable"], ["Power supplies", "3 × 4,000 W, fanless"], ["Fans", "6 × 48 V, up to 9,000 RPM"], ["Repairs", "tool-free on the rack, under 90 s"], ["Size", "390 × 290 × 500 mm"], ["Weight", "110 lb (about 50 kg)"], ["Cooling", "air, or immersion"], ["Revealed", "August 2025"]],
      note: "From Proto's specifications; the model follows them at 1.6 times life size.", sources: [SRC.proto, SRC.protoReview] }
  ];
  // Network hashrate, log10 of hashes a second: mempool.space's daily estimates (/api/v1/mining/hashrate/all)
  // averaged over five weeks round each point, every quarter from January 2009 to November 2026.
  const HISTORY = [[2009.05, 6.74], [2009.3, 6.76], [2009.55, 6.5], [2009.8, 6.53], [2010.05, 7.05], [2010.3, 7.88], [2010.55, 9.18], [2010.8, 10.28],
    [2011.05, 11.19], [2011.3, 11.92], [2011.55, 13.1], [2011.8, 12.97], [2012.05, 12.98], [2012.3, 13.06], [2012.55, 13.15], [2012.8, 13.36],
    [2013.05, 13.36], [2013.3, 13.84], [2013.55, 14.39], [2013.8, 15.41], [2014.05, 16.2], [2014.3, 16.74], [2014.55, 17.13], [2014.8, 17.43],
    [2015.05, 17.49], [2015.3, 17.53], [2015.55, 17.57], [2015.8, 17.65], [2016.05, 17.96], [2016.3, 18.12], [2016.55, 18.18], [2016.8, 18.26],
    [2017.05, 18.44], [2017.3, 18.58], [2017.55, 18.78], [2017.8, 18.97], [2018.05, 19.26], [2018.3, 19.45], [2018.55, 19.61], [2018.8, 19.71],
    [2019.05, 19.63], [2019.3, 19.66], [2019.55, 19.83], [2019.8, 19.97], [2020.05, 20.04], [2020.3, 20.05], [2020.55, 20.09], [2020.8, 20.12],
    [2021.05, 20.18], [2021.3, 20.21], [2021.55, 20.01], [2021.8, 20.18], [2022.05, 20.27], [2022.3, 20.33], [2022.55, 20.31], [2022.8, 20.42],
    [2023.05, 20.44], [2023.3, 20.54], [2023.55, 20.57], [2023.8, 20.65], [2024.05, 20.73], [2024.3, 20.79], [2024.55, 20.79], [2024.8, 20.84],
    [2025.05, 20.9], [2025.3, 20.94], [2025.55, 20.96], [2025.8, 21.03], [2026.05, 20.99], [2026.3, 20.98], [2026.55, 20.96], [2026.84, 21.01]];
  // Today's rate as the crown shows it with no live reading: the 30-day average to 10 November 2026.
  const BAKED = { rate: 1.03e21, when: "30-day average · Nov 2026" };
  // The chart wraps the dome from 2009 by the door on the left (azimuth -168) to its end on the right (168), the same
  // distance either side of the unit labels over the door (180).
  const START = 2009, END = 2026.9, azOf = (yr) => -168 + (yr - START) / (END - START) * 336;
  // The eras' tints are faint: the dome's screen shows its canvas about twice as bright as it is painted.
  const ERAS = [["CPU", 2009, 2010.5, "rgba(120,160,255,.06)"], ["GPU", 2010.5, 2011.5, "rgba(80,220,140,.06)"], ["FPGA", 2011.5, 2013, "rgba(230,200,60,.06)"], ["ASIC", 2013, END, "rgba(247,147,26,.04)"]];
  const UNITS = [[6, "MH/s"], [9, "GH/s"], [12, "TH/s"], [15, "PH/s"], [18, "EH/s"], [21, "ZH/s"]];
  // The exhibits' azimuths: their years', pushed apart where years crowd so neighbours keep 9 degrees.
  const AZ = [], S21 = MINERS.findIndex((ex) => ex.model === "s21");
  MINERS.forEach((ex, i) => { const a = azOf(ex.year); AZ.push(i && a < AZ[i - 1] + 9 ? AZ[i - 1] + 9 : a); });
  const headingTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  // Plinths (their top at TOP), and the big S21's scale.
  const TOP = 0.9, BIG = 2.2;

  // ---------- the models, 1.6 times life size, each on its plinth with its front to -z (the ring's middle) ----------
  // Real sizes in millimetres, scaled to the museum's by `mm`. Every label and screen is drawn as geometry, so the
  // viewer shows them as the hall does. Where one part lies on another it stands at least LIFT proud of it, and no two
  // faces looking the same way share a plane where they overlap, so the hall's depth test never flickers between them
  // and the viewer always has a true order to draw them in.
  const mm = (v) => v * 1.6e-3, LIFT = 0.002, HALF = Math.PI / 2;
  const ANTMINER = {
    s3: { len: 331, wid: 137, hei: 160, psu: "atx", fans: 1, color: "#a3aab3", frame: "#6f767e", text: "S3" },
    s7: { len: 301, wid: 123, hei: 155, psu: "side", fans: 1, color: "#bcc2c9", frame: "#7f868e", text: "S7" },
    s9: { len: 350, wid: 135, hei: 158, psu: "side", fans: 1, color: "#b8bec6", frame: "#8d939b", text: "S9" },
    m3: { len: 335, wid: 125, hei: 155, psu: "none", fans: 1, color: "#b9bfc6", frame: "#848a92", text: "M3", maker: "WHATSMINER", brand: "MICROBT" },
    s15: { len: 279, wid: 176, hei: 221, psu: "top", fans: 1, fan: 120, color: "#adb3ba", frame: "#7b8189", text: "S15", psuName: "APW8" },
    s17: { len: 298, wid: 178, hei: 296, psu: "top", fans: 2, color: "#aab0b8", frame: "#7f858d", text: "S17 PRO", psuName: "APW9" },
    s19: { len: 400, wid: 195.5, hei: 290, psu: "top", fans: 2, color: "#b4b9bf", frame: "#868c94", text: "S19 PRO", psuName: "APW12" },
    m50s: { len: 430, wid: 155, hei: 240, psu: "top", fans: 1, color: "#c3c8ce", frame: "#8a9097", text: "M50S", maker: "WHATSMINER", brand: "MICROBT", psuName: "MICROBT" },
    s19xp: { len: 400, wid: 195.5, hei: 290, psu: "top", fans: 2, color: "#b9bec4", frame: "#80868e", text: "S19 XP", psuName: "APW12" },
    s21: { len: 400, wid: 195, hei: 290, psu: "top", fans: 2, color: "#7d838c", frame: "#555a62", text: "S21", psuName: "APW12" },
    hydro: { len: 410, wid: 170, hei: 209, psu: "in", fans: 0, color: "#3a3e45", frame: "#25282d", text: "S21 XP HYD" }
  };
  // Rows of pixels ("#" filled) as one flat geometry facing -z, its middle at the origin, each `px` across and `py`
  // tall: QR codes and barcodes, built as the island's words are.
  const pixels = (rows, px, py, color, emissive = 0.1) => {
    const geo = RM.helpers.blank(), H = rows.length, W = rows[0].length, IN = [0, 0, -1];
    const x = (c) => (W / 2 - c) * px, y = (r) => (H / 2 - r) * py;
    rows.forEach((row, r) => {
      for (let c = 0; c < W; c++) {
        if (row[c] !== "#") continue;
        let e = c;
        while (row[e + 1] === "#") e++;
        RM.helpers.quad(geo, [x(e + 1), y(r + 1), 0], [x(c), y(r + 1), 0], [x(c), y(r), 0], [x(e + 1), y(r), 0], color, emissive, IN);
        c = e;
      }
    });
    return BL.models.noShadow(geo);
  };
  // A QR code's 21 rows: its three finder squares, the timing lines and a fixed scatter of modules.
  const QR = (() => {
    const N = 21, rows = [];
    const finder = (r, c) => {
      for (const [r0, c0] of [[0, 0], [0, 14], [14, 0]]) {
        const a = r - r0, b = c - c0;
        if (a < -1 || a > 7 || b < -1 || b > 7) continue;
        if (a < 0 || a > 6 || b < 0 || b > 6) return 0;
        return Math.max(Math.abs(a - 3), Math.abs(b - 3)) === 2 ? 0 : 1;
      }
      return -1;
    };
    for (let r = 0; r < N; r++) {
      let row = "";
      for (let c = 0; c < N; c++) {
        const f = finder(r, c);
        row += f === 1 || f === -1 && ((r === 6 || c === 6) ? (r + c) % 2 === 0 : (r * 7 + c * 13 + r * c * 3) % 5 < 2) ? "#" : ".";
      }
      rows.push(row);
    }
    return rows;
  })();
  const BARCODE = ["#.##.#..###.#.#..##.###.#..#.##..#.###.##.#"];
  // Cables and ribbons as they lie: a run through corner points with every corner bent in a curve (a quadratic Bézier
  // with the corner as its control) that starts `round` before it and ends `round` after, or less on a short leg, and
  // each end carried `tuck` on into whatever it plugs into, so no end cap lies on a face.
  const v3 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len: (a) => Math.hypot(a[0], a[1], a[2]), cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] };
  const unit = (a) => { const l = v3.len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const bend = (pts, round, tuck) => {
    const P = pts.map((p) => p.slice()), last = P.length - 1;
    const d0 = unit(v3.sub(P[0], P[1])), d1 = unit(v3.sub(P[last], P[last - 1]));
    for (let a = 0; a < 3; a++) { P[0][a] += d0[a] * tuck; P[last][a] += d1[a] * tuck; }
    const out = [P[0]];
    for (let i = 1; i < last; i++) {
      const p = P[i - 1], c = P[i], q = P[i + 1], l0 = v3.len(v3.sub(c, p)), l1 = v3.len(v3.sub(q, c)), cut = Math.min(round, 0.45 * l0, 0.45 * l1);
      if (cut < 1e-6) { out.push(c); continue; }
      const a = c.map((v, k) => v + (p[k] - v) * cut / l0), b = c.map((v, k) => v + (q[k] - v) * cut / l1);
      for (let n = 0; n <= 6; n++) { const t = n / 6, u = 1 - t; out.push([0, 1, 2].map((k) => u * u * a[k] + 2 * u * t * c[k] + t * t * b[k])); }
    }
    out.push(P[last]);
    return out.filter((p, i) => i === 0 || v3.len(v3.sub(p, out[i - 1])) > 1e-6);
  };
  // A cross-section `section` ([[n, b], ...] round its middle) swept along a run: at each point square to the run, `n`
  // along a normal carried along it without twisting (or, given `up`, square to `up`, for a ribbon that lies flat
  // across `up`) and `b` along the third axis; capped at both ends.
  const sweep = (run, section, color, up = null) => {
    const geo = RM.helpers.blank(), rings = [], ends = run.length - 1;
    let N = null;
    for (let j = 0; j <= ends; j++) {
      const t = unit(v3.sub(run[Math.min(j + 1, ends)], run[Math.max(j - 1, 0)]));
      let B;
      if (up) { N = unit(v3.cross(t, up)); B = v3.cross(N, t); } else {
        if (!N) N = unit(v3.cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
        const along = N[0] * t[0] + N[1] * t[1] + N[2] * t[2];
        N = unit([N[0] - t[0] * along, N[1] - t[1] * along, N[2] - t[2] * along]);
        B = v3.cross(t, N);
      }
      rings.push(section.map(([a, b]) => [0, 1, 2].map((k) => run[j][k] + N[k] * a + B[k] * b)));
    }
    // Each side between two rings as two triangles: a quad between rings turned along a curve is not quite flat, and
    // the model viewer's tree would cut such a face again and again.
    const n = section.length;
    for (let j = 0; j < ends; j++) for (let k = 0; k < n; k++) {
      const a = rings[j][k], b = rings[j][(k + 1) % n], c = rings[j + 1][(k + 1) % n], d = rings[j + 1][k];
      const out = v3.sub(a.map((v, i) => (v + c[i]) / 2), [0, 1, 2].map((i) => (run[j][i] + run[j + 1][i]) / 2));
      RM.helpers.face(geo, [a, b, c], color, 0, out);
      RM.helpers.face(geo, [a, c, d], color, 0, out);
    }
    RM.helpers.face(geo, rings[0], color, 0, v3.sub(run[0], run[1]));
    RM.helpers.face(geo, rings[ends], color, 0, v3.sub(run[ends], run[ends - 1]));
    return geo;
  };
  // Which way a frame's -z looks: its turn about y, then about x.
  const FACES = { "-z": [0, 0], "+z": [Math.PI, 0], "-x": [HALF, 0], "+x": [-HALF, 0], "+y": [0, HALF], "-y": [0, -HALF] };

  // What each machine's mains plug into on the back of its plinth, wired as it would be in the US: household 120 V
  // (NEMA 5-15) for the desktops, the early rigs and the small machines; 240 V for the ASICs that need it, NEMA 6-15
  // for those on a C13 cord and 6-20 for the S19 family's C19 cords; a 240 V PDU's C19 sockets for the S21's P13 cord
  // and the Proto Rig's three cords, which end in C20 plugs; and a red 400 V three-phase socket (IEC 60309) for the
  // hydro-cooled S21 XP. The Bitaxe runs from a wall adapter.
  const POWER = { cpu: "5-15", gpu: "5-15", pool: "5-15", fpga: "5-15", avalon: "5-15", erupter: "5-15", s3: "5-15", bitaxe: "wart",
    s7: "6-15", s9: "6-15", m3: "6-15", s15: "6-15", s17: "6-15", s19: "6-20", m50s: "6-20", s19xp: "6-20", s21: "c20", proto: "c20", hydro: "3ph" };
  // Each plug's body: across, up, its length out from the socket, and its colour; and each connector at a machine.
  const PLUGS = { "5-15": [0.04, 0.046, 0.034, "#18181a"], "6-15": [0.046, 0.05, 0.04, "#1f2023"], "6-20": [0.046, 0.05, 0.04, "#1f2023"], c20: [0.05, 0.036, 0.05, "#141416"],
    wart: [0.064, 0.078, 0.05, "#1a1a1c"], rj45: [0.022, 0.018, 0.03, "#d5d8de"] };
  const CONNECT = { c13: [0.032, 0.024, 0.036, "#141416"], c19: [0.04, 0.03, 0.044, "#141416"], p13: [0.052, 0.036, 0.05, "#16171a"], rj45: [0.02, 0.016, 0.026, "#d5d8de"], dc: [0.011, 0.011, 0.03, "#141416"] };

  // A miner in kit `root`, standing at height `y`, `s` times the museum's size; `wired` on its plinth in the hall, its
  // cords plugged into the plinth's back, or not (the viewer, which shows the machine alone, its cords' plugs lying).
  const model = (root, kind, s = 1, y = 0, wired = false) => {
    // The tools for a frame `k` whose origin stands `base` up: boxes; cylinders, upright unless turned; tori, flat unless
    // turned; lit boxes; words and pixel rows, facing -z; `at`, a frame of its own placed and turned in this one, and
    // `face`, one whose -z looks along a face; `cable`, a round cable `r` thick through corner points, bent smoothly at
    // each; and `ribbon`, a flat ribbon `w` wide and `t` thick, lying flat across `up`, through corner points the same.
    const tools = (k, base) => {
      const T = {
        B: (w, h, d, color, x, yy, z, o) => k.box(w * s, h * s, d * s, color, x * s, base + yy * s, z * s, o),
        Y: (rt, rb, h, color, x, yy, z, o) => k.cyl(rt * s, rb * s, h * s, color, x * s, base + yy * s, z * s, o),
        R: (rr, r, color, x, yy, z, o) => k.torus(rr * s, r * s, color, x * s, base + yy * s, z * s, o),
        lit: (w, h, d, color, x, yy, z, e = 0.95) => T.B(w, h, d, color, x, yy, z, { emissive: e, glow: true }),
        add: (geo, x, yy, z) => k.add(geo, x * s, base + yy * s, z * s),
        say: (text, px, color, x, yy, z, e = 0.25) => T.add(RM.helpers.litWord(text, px * s, color, e), x, yy, z),
        dots: (rows, px, py, color, x, yy, z, e) => T.add(pixels(rows, px * s, py * s, color, e), x, yy, z),
        at: (x, yy, z, ry = 0, rx = 0, rz = 0) => tools(k.group(x * s, base + yy * s, z * s, ry, rx, rz), 0),
        face: (face, x, yy, z, spin = 0) => T.at(x, yy, z, FACES[face][0], FACES[face][1], spin),
        cable: (pts, r, color) => {
          const ring = Array.from({ length: 8 }, (_, i) => [Math.cos(i / 8 * P.TAU) * r * s / 2, Math.sin(i / 8 * P.TAU) * r * s / 2]);
          T.add(sweep(bend(pts.map((p) => p.map((v) => v * s)), Math.max(0.03, 5 * r) * s, 0.3 * r * s), ring, color), 0, 0, 0);
        },
        ribbon: (pts, w, t, color, up) => {
          const flat = [[-t * s / 2, -w * s / 2], [t * s / 2, -w * s / 2], [t * s / 2, w * s / 2], [-t * s / 2, w * s / 2]];
          T.add(sweep(bend(pts.map((p) => p.map((v) => v * s)), 0.035 * s, 0.002 * s), flat, color, up), 0, 0, 0);
        }
      };
      return T;
    };
    const T = tools(root, y), { B, Y, R, lit } = T;
    // In a frame looking out of a face, the depth of layer `n` laid on it (LIFT thick, each LIFT clear of the last)
    // and of words written on that layer.
    const lay = (n) => -0.003 - 0.004 * n, ink = (n) => lay(n) - 0.0025;
    // A screw head at (x, yy) on frame F's face.
    const screw = (F, x, yy, r = 0.0055, on = 0) => F.Y(r, r, 0.003, C.screw, x, yy, on - 0.0015, { rx: HALF, seg: 8 });
    // ---------- its cords ----------
    // Every cord: `lead(type, pts, r, color, at)`, its run from the machine to the plinth's top short of its back edge,
    // "mains" or "lan", `at` the connector it ends in at the machine (CONNECT), or none where it leaves a box of its own.
    // `wire` lays them as the model ends. On a plinth each runs on over the back edge and down to the plates on the
    // plinth's back (the outlets POWER names and an Ethernet jack beside them) and is plugged in; for the viewer each
    // ends in its plug lying behind the machine, so its kind shows.
    const leads = [];
    const lead = (type, pts, r, color, at = null) => leads.push({ type, pts, r, color, at });
    // A box `size` ([across, up, along]) laid along an axis `d` from point `p`, its far end returned.
    const along = (p, d, size, color) => {
      const [w, h, l] = size, ax = Math.abs(d[0]) > 0.5, ay = Math.abs(d[1]) > 0.5;
      B(ax ? l : w, ay ? l : h, ax || ay ? (ax ? w : h) : l, color, p[0] + d[0] * l / 2, p[1] + d[1] * l / 2, p[2] + d[2] * l / 2);
      return [p[0] + d[0] * l, p[1] + d[1] * l, p[2] + d[2] * l];
    };
    // A plug's prongs on its face at `z`, standing out along +z: for a plug lying unplugged.
    const prongs = (type, x, yy, z) => {
      const blade = (bx, by, flat) => B(flat ? 0.012 : 0.003, flat ? 0.003 : 0.012, 0.018, "#c9ccd2", x + bx, yy + by, z + 0.009);
      if (type === "5-15" || type === "wart") { blade(-0.0102, 0.006, false); blade(0.0102, 0.006, false); }
      if (type === "6-15") { blade(-0.0102, 0.006, true); blade(0.0102, 0.006, true); }
      if (type === "6-20") { blade(-0.0102, 0.006, true); blade(0.0102, 0.006, false); }
      if (type === "5-15" || type === "6-15" || type === "6-20") Y(0.0028, 0.0028, 0.018, "#c9ccd2", x, yy - 0.012, z + 0.009, { rx: HALF, seg: 8 });
      if (type === "c20") { B(0.036, 0.022, 0.012, "#0b0b0c", x, yy, z + 0.006); for (const bx of [-0.011, 0, 0.011]) B(0.007, 0.002, 0.012, "#c9ccd2", x + bx, yy + (bx ? -0.002 : 0.004), z + 0.012); }
      if (type === "rj45") B(0.014, 0.003, 0.004, "#d6b14a", x, yy + 0.005, z - 0.004);
    };
    const wire = () => {
      if (!leads.length || wired === "bare") return {};
      const plugType = POWER[kind], mains = leads.filter((l) => l.type === "mains"), lan = leads.filter((l) => l.type === "lan");
      // On the plinth's back: a plate under each cord where it comes over the back edge (one duplex under two 120 V
      // cords that come over side by side, a PDU or a three-phase socket under all of a machine's mains cords), in the
      // cords' order across it and kept apart, so every cord comes straight down to its socket and none crosses
      // another; a cord's socket is `place`'s.
      const place = new Map(), yc = -0.33, Wf = T.face("+z", 0, 0, 0.6), GAP = 0.03, EDGE = 0.56, PAIR = 0.12;
      const sockets = { push: (u, i, q) => { if (u.leads[i]) place.set(u.leads[i], q); } };
      if (wired) {
        const endX = (l) => l.pts[l.pts.length - 1][0], order = leads.slice().sort((a, b) => endX(a) - endX(b)), units = [];
        const unitOf = (what, w, list) => ({ kind: what, w, leads: list, d: list.reduce((t, l) => t + endX(l), 0) / list.length });
        if (plugType === "c20" || plugType === "3ph") {
          const one = unitOf(plugType === "c20" ? "pdu" : "3ph", plugType === "c20" ? 0.46 : 0.15, order.filter((l) => l.type === "mains"));
          // A PDU's cords take its sockets from the left end, so it stands where those sockets are under them.
          if (one.kind === "pdu") one.d -= -one.w / 2 + 0.09 + (one.leads.length - 1) * 0.045;
          if (lan.length) { const jack = unitOf("lan", 0.112, lan); units.push(...(jack.d < one.d ? [jack, one] : [one, jack])); } else units.push(one);
        } else for (let i = 0; i < order.length; i++) {
          const l = order[i], n = order[i + 1];
          if (l.type === "lan") units.push(unitOf("lan", 0.112, [l]));
          else if (plugType === "6-15" || plugType === "6-20") units.push(unitOf(plugType, 0.112, [l]));
          else if (n && n.type === "mains" && endX(n) - endX(l) <= PAIR) { units.push(unitOf("duplex", 0.112, [l, n])); i++; }
          else units.push(unitOf("duplex", 0.112, [l]));
        }
        // With no cable to it, the Ethernet jack on the side with more room.
        if (!lan.length) {
          const a = units[0], b = units[units.length - 1], jack = { kind: "lan", w: 0.112, leads: [] };
          if (a.d + b.d > 0) units.unshift({ ...jack, d: a.d - (a.w + 0.112) / 2 - GAP }); else units.push({ ...jack, d: b.d + (b.w + 0.112) / 2 + GAP });
        }
        // Each centre as near its cords as it can be: a centre is its offset in the packed row plus a shift that never
        // falls from one plate to the next, the shifts fitted by pooling neighbours that would overlap, then held
        // inside the plinth's back.
        let off = 0;
        units.forEach((u, i) => { if (i) off += (units[i - 1].w + u.w) / 2 + GAP; u.off = off; });
        const pools = [];
        for (const u of units) {
          pools.push({ sum: u.d - u.off, n: 1 });
          while (pools.length > 1 && pools[pools.length - 2].sum / pools[pools.length - 2].n > pools[pools.length - 1].sum / pools[pools.length - 1].n) {
            const top = pools.pop();
            pools[pools.length - 1].sum += top.sum; pools[pools.length - 1].n += top.n;
          }
        }
        const lo = -EDGE + units[0].w / 2, hi = EDGE - units[units.length - 1].w / 2 - units[units.length - 1].off;
        let k = 0;
        for (const pool of pools) for (let j = 0; j < pool.n; j++, k++) units[k].cx = units[k].off + Math.min(hi, Math.max(lo, pool.sum / pool.n));
        for (const u of units) {
          const cx = u.cx, lx = -cx;
          if (u.kind === "pdu") {
            Wf.B(u.w, 0.07, 0.045, "#1b1c1f", lx, yc, -0.0225);
            for (const sx of [-1, 1]) Wf.B(0.03, 0.09, 0.006, "#2a2c30", lx + sx * (u.w / 2 + 0.015), yc, -0.003);
            Wf.lit(0.006, 0.006, LIFT, C.led, lx + u.w / 2 - 0.025, yc + 0.02, -0.045 - LIFT / 2, 0.9);
            Wf.say("240V PDU", 0.0018, "#cfd3d8", lx, yc - 0.027, -0.0475, 0.4);
            for (let i = 0; i < 4; i++) {
              const sxw = cx - u.w / 2 + 0.09 + i * 0.09;
              Wf.B(0.044, 0.034, LIFT, "#0b0b0c", -sxw, yc, -0.045 - LIFT / 2);
              for (const bx of [-0.012, 0, 0.012]) Wf.B(0.008, 0.003, LIFT, "#3a3d42", -sxw + bx, yc + (bx ? -0.003 : 0.006), -0.045 - LIFT - LIFT / 2);
              sockets.push(u, i, { x: sxw, y: yc, z: 0.645 + 2 * LIFT + 0.0005 });
            }
          } else if (u.kind === "3ph") {
            Wf.B(u.w, 0.17, 0.07, "#c9ccd2", lx, yc, -0.035);
            Wf.Y(0.05, 0.05, 0.03, "#c8102e", lx, yc - 0.01, -0.085, { rx: HALF, seg: 18 });
            Wf.B(0.11, 0.02, 0.06, "#c8102e", lx, yc + 0.06, -0.1, { rx: -0.6 });
            Wf.say("400V 3~", 0.0022, "#1a1a1a", lx, yc + 0.07, -0.0725, 0.2);
            sockets.push(u, 0, { x: cx, y: yc - 0.01, z: 0.7 });
          } else {
            // A wall plate: its sockets (two for 120 V, a lone cord in the top one; one for a 240 V circuit) or the
            // Ethernet jack.
            Wf.B(u.w, 0.184, 0.006, "#eeeae0", lx, yc, -0.003);
            const at = u.kind === "duplex" ? [yc + 0.046, yc - 0.046] : [yc + 0.01];
            for (const sy of u.kind === "duplex" ? [yc] : [yc + 0.075, yc - 0.065]) Wf.Y(0.004, 0.004, 0.003, "#c9ccd2", lx, sy, -0.0075, { rx: HALF, seg: 8 });
            at.forEach((ys, i) => {
              if (u.kind === "lan") {
                Wf.B(0.034, 0.034, 0.004, "#f4f1e8", lx, ys, -0.008);
                Wf.B(0.022, 0.018, LIFT, "#0b0b0c", lx, ys, -0.011);
                Wf.say("LAN", 0.0022, "#6a6a6a", lx, ys - 0.032, -0.0085, 0.1);
                sockets.push(u, i, { x: cx, y: ys, z: 0.612 });
                return;
              }
              Wf.B(0.054, 0.058, 0.004, "#f4f1e8", lx, ys, -0.008);
              const slot = (bx, by, flat) => Wf.B(flat ? 0.012 : 0.004, flat ? 0.004 : 0.012, LIFT, "#1a1a1a", lx + bx, ys + by, -0.011);
              if (u.kind === "duplex") { slot(-0.0102, 0.006, false); slot(0.0102, 0.006, false); }
              if (u.kind === "6-15") { slot(-0.0102, 0.006, true); slot(0.0102, 0.006, true); }
              if (u.kind === "6-20") { slot(-0.0102, 0.006, true); slot(0.0102, 0.006, false); slot(0.0102, 0.006, true); }
              Wf.Y(0.0035, 0.0035, LIFT, "#1a1a1a", lx, ys - 0.012, -0.011, { rx: HALF, seg: 8 });
              Wf.say(u.kind === "duplex" ? "120V" : u.kind === "6-15" ? "240V 15A" : "240V 20A", 0.0016, "#8a8478", lx, ys - 0.034, -0.0085, 0.1);
              sockets.push(u, i, { x: cx, y: ys, z: 0.612, under: i === 1 });
            });
          }
        }
      }
      // How far out the cords hang as they come down: clear of every plug.
      const depth = (type) => type === "3ph" ? 0.12 : (PLUGS[type] || PLUGS["5-15"])[2] + 0.02;
      const hang = Math.max(0.69, ...mains.filter((l) => place.has(l)).map((l) => place.get(l).z + depth(plugType) + 0.035));
      // Every cord turns down onto its socket from one height, so their runs down the back stay in order.
      const over = Math.max(...[...place.values()].map((q) => q.y)) + 0.09;
      const lay2 = (list, type) => list.forEach((l) => {
        let pts = l.pts.map((q) => q.slice());
        if (l.at) {
          const d = unit(v3.sub(pts[1], pts[0])), [w, h, len, color] = CONNECT[l.at];
          pts[0] = along(pts[0], d, [w, h, len], color);
          if (l.at === "rj45") pts[0] = along(pts[0], d, [0.016, 0.014, 0.014], l.color);
        }
        const end = pts[pts.length - 1], q = wired ? place.get(l) : null;
        if (q) {
          // Plugged in: the body out from the socket, a strain relief behind it, and the cord looping down to it.
          let back;
          if (type === "3ph") {
            Y(0.042, 0.042, 0.1, "#c8102e", q.x, q.y, q.z + 0.05, { rx: HALF, seg: 18 });
            Y(0.046, 0.046, 0.02, "#9aa0a8", q.x, q.y, q.z + 0.03, { rx: HALF, seg: 18 });
            back = q.z + 0.1;
          } else {
            const [w, h, len, color] = PLUGS[type];
            back = along([q.x, q.y, q.z], [0, 0, 1], [w, h, len], color)[2];
            if (type !== "wart") back = along([q.x, q.y, back], [0, 0, 1], [l.r * 2 + 0.004, l.r * 2 + 0.004, 0.016], type === "rj45" ? l.color : color)[2];
          }
          const zd = Math.max(hang, back + 0.03);
          pts.push([end[0], end[1], 0.57], [end[0], 0.022, 0.636], [end[0], -0.07, zd]);
          // Into the lower socket of a duplex, the cord comes down beside the plug above and in under it.
          if (q.under) { const x = q.x + PLUGS[type][0] / 2 + l.r + 0.006; pts.push([x, over, zd], [x, q.y, zd]); } else pts.push([q.x, over, zd]);
          pts.push([q.x, q.y, zd], [q.x, q.y, back]);
        } else {
          // Unplugged: the plug lying at the cord's end, its prongs out behind it.
          if (type === "3ph") {
            Y(0.042, 0.042, 0.1, "#c8102e", end[0], 0.042, end[2] + 0.05, { rx: HALF, seg: 18 });
            for (let k = 0; k < 5; k++) { const a = k / 5 * P.TAU; Y(0.004, 0.004, 0.02, "#c9ccd2", end[0] + Math.cos(a) * 0.022, 0.042 + Math.sin(a) * 0.022, end[2] + 0.11, { rx: HALF, seg: 6 }); }
            pts[pts.length - 1] = [end[0], 0.042, end[2]];
          } else {
            const [w, h, len, color] = PLUGS[type], yy = h / 2 + 0.002, face = end[2] + len;
            B(w, h, len, color, end[0], yy, end[2] + len / 2);
            prongs(type, end[0], yy, face);
            pts[pts.length - 1] = [end[0], yy, end[2]];
          }
        }
        T.cable(pts, l.r, l.color);
      });
      lay2(mains, plugType);
      lay2(lan, "rj45");
      return {};
    };
    // A fan, `w` across and `d` deep, its back on frame F's origin and blowing out along its -z: the square housing
    // round its throat, the three struts that hold the motor, seven pitched blades round the hub, and its sticker.
    const fan = (F, w, d = 0.25 * w) => {
      const t = 0.06 * w, c = 0.12 * w;
      for (const sy of [-1, 1]) F.B(w, t, d, C.fanPlate, 0, sy * (w - t) / 2, -d / 2);
      for (const sx of [-1, 1]) F.B(t, w - 2 * t, d, C.fanPlate, sx * (w - t) / 2, 0, -d / 2);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) F.B(c, c, d, C.fanPlate, sx * (w / 2 - t - c / 2), sy * (w / 2 - t - c / 2), -d / 2);
      for (let b = 0; b < 3; b++) F.at(0, 0, -0.0025, 0, 0, HALF + b / 3 * P.TAU).B(0.3 * w, 0.035 * w, 0.003, C.fanPlate, 0.29 * w, 0, 0);
      for (let b = 0; b < 7; b++) F.at(0, 0, -0.5 * d, 0, 0, b / 7 * P.TAU).B(0.26 * w, 0.13 * w, 0.003, C.blade, 0.29 * w, 0, 0, { rx: 0.35 });
      F.Y(0.17 * w, 0.17 * w, 0.85 * d - 0.006, C.hub, 0, 0, -(0.85 * d + 0.006) / 2, { rx: HALF, seg: 12 });
      F.Y(0.12 * w, 0.12 * w, 0.002, C.sticker, 0, 0, -0.85 * d - 0.001, { rx: HALF, seg: 10 });
    };
    // A wire guard over an opening `w` across in a face at frame F's origin, lying on that face: three rings, a boss in
    // the middle, and two wires across that reach past the opening onto the face, screwed down at their ends.
    const guard = (F, w) => {
      for (const r of [0.18, 0.31, 0.44]) F.R(r * w, 0.0035, C.guard, 0, 0, -0.0035, { rx: HALF, seg: 16, sides: 3 });
      F.B(w + 0.016, 0.006, 0.004, C.guard, 0, 0, -0.002);
      F.B(0.006, w + 0.004, 0.004, C.guard, 0, 0, -0.002);
      F.Y(0.07 * w, 0.07 * w, 0.003, C.guard, 0, 0, -0.0055, { rx: HALF, seg: 10 });
      for (const sx of [-1, 1]) screw(F, sx * (w / 2 + 0.004), 0, 0.004, -0.004);
    };
    // A fan behind a grille flush on a face (a power supply's): the dark throat, the blades and hub just behind the
    // wires, and the guard's rings, rim and cross over them.
    const grille = (F, w) => {
      F.Y(0.47 * w, 0.47 * w, LIFT, C.fanHole, 0, 0, -LIFT / 2, { rx: HALF, seg: 18 });
      for (let b = 0; b < 7; b++) F.at(0, 0, -0.0055, 0, 0, b / 7 * P.TAU).B(0.26 * w, 0.12 * w, 0.0015, C.blade, 0.29 * w, 0, 0, { rx: 0.2 });
      F.Y(0.15 * w, 0.15 * w, 0.006, C.hub, 0, 0, -0.005, { rx: HALF, seg: 12 });
      for (const r of [0.2, 0.33, 0.47]) F.R(r * w, 0.003, C.guard, 0, 0, -0.013, { rx: HALF, seg: 16, sides: 3 });
      for (let b = 0; b < 2; b++) F.B(0.94 * w, 0.005, 0.004, C.guard, 0, 0, -0.013, { rz: b * HALF });
    };
    // An end plate `depth` deep facing out along `face` at z, `W2` across about x and `H2` tall from y0, with a square
    // opening `f` across for a fan at each height in `holes`: each fan set back in its opening, a dark throat behind
    // it, and its guard over the opening, fixed to the plate.
    const bay = (face, x, y0, z, W2, H2, holes, f, color, depth) => {
      const Fp = T.face(face, x, 0, z), side = (W2 - f) / 2;
      for (const sx of [-1, 1]) Fp.B(side, H2, depth, color, sx * (f + side) / 2, y0 + H2 / 2, depth / 2);
      let y = y0;
      for (const yy of [...holes, null]) {
        const top = yy === null ? y0 + H2 : yy - f / 2;
        if (top - y > 1e-6) Fp.B(f, top - y, depth, color, 0, (y + top) / 2, depth / 2);
        if (yy === null) break;
        y = yy + f / 2;
        Fp.Y(0.47 * f, 0.47 * f, LIFT, C.fanHole, 0, yy, depth - 0.0055, { rx: HALF, seg: 18 });
        fan(Fp.at(0, yy, depth), f * 0.96, depth - 0.008);
        guard(Fp.at(0, yy, 0), f);
      }
    };
    // A graphics card's blower, `r` round, in its shroud at frame F's origin: the dark intake, nine pitched blades,
    // the hub and its red cap.
    const blower = (F, r) => {
      F.Y(r, r, 0.002, C.fanHole, 0, 0, -0.001, { rx: HALF, seg: 20 });
      for (let b = 0; b < 9; b++) F.at(0, 0, -0.0055, 0, 0, b / 9 * P.TAU).B(0.62 * r, 0.1 * r, 0.003, C.blade, 0.55 * r, 0, 0, { rx: 0.5 });
      F.Y(0.3 * r, 0.3 * r, 0.006, C.hub, 0, 0, -0.005, { rx: HALF, seg: 14 });
      F.Y(0.2 * r, 0.2 * r, 0.002, "#c8102e", 0, 0, -0.009, { rx: HALF, seg: 14 });
    };
    // A miner's label, `w` across, its middle at frame F's origin: its line (ANTMINER, say) and the model over a
    // barcode, the QR code beside them and its maker under it.
    const label = (F, w, text, line = "ANTMINER", maker = "BITMAIN") => {
      const h = w * 0.46, z = -LIFT - 0.0015, q = h * 0.7 / 21;
      F.B(w, h, LIFT, C.label, 0, 0, -LIFT / 2);
      F.say(line, w * Math.min(0.0105, 0.4 / (line.length * 6)), C.ink, w * 0.16, h * 0.28, z, 0.1);
      F.say(text, w * Math.min(0.0105, 0.36 / (text.length * 6)), C.ink, w * 0.16, h * 0.02, z, 0.1);
      F.dots(BARCODE, w * 0.012, h * 0.2, C.ink, w * 0.16, -h * 0.28, z, 0.05);
      F.dots(QR, q, q, C.ink, -w * 0.3, h * 0.04, z, 0.05);
      F.say(maker, w * 0.005, "#55504a", -w * 0.3, -h * 0.42, z, 0.1);
    };
    // The control board's panel at frame F's origin, `w` by `h`: the network port with its two lights, the status
    // lights, the IP Report button and the reset hole, in a column when the panel stands tall.
    const ports = (F, w, h) => {
      const tall = h > w, at = (a, b) => tall ? [0, b] : [a, 0];
      F.B(w, h, 0.004, "#1c1e22", 0, 0, -0.002);
      const [px, py] = at(w * 0.28, h * 0.26);
      F.B(0.017, 0.014, 0.006, "#0b0b0d", px, py, -0.007);
      F.lit(0.003, 0.003, LIFT, C.led, px + 0.006, py + 0.0055, -0.011);
      F.lit(0.003, 0.003, LIFT, C.amber, px - 0.006, py + 0.0055, -0.011);
      ports.at = [px, py];
      const [lx, ly] = at(-w * 0.02, -h * 0.02);
      F.lit(0.005, 0.005, LIFT, C.led, lx + (tall ? -0.006 : 0), ly + (tall ? 0 : 0.005), -0.005);
      F.lit(0.005, 0.005, LIFT, "#ff4a3d", lx + (tall ? 0.006 : 0), ly - (tall ? 0 : 0.005), -0.005);
      const [bx, by] = at(-w * 0.26, -h * 0.22);
      F.Y(0.0035, 0.0035, 0.004, "#2a2a2a", bx, by, -0.006, { rx: HALF, seg: 8 });
      F.Y(0.0015, 0.0015, LIFT, "#050505", bx + (tall ? 0 : -0.012), by + (tall ? -0.014 : 0), -0.005, { rx: HALF, seg: 6 });
    };

    if (kind === "cpu") {
      // A high-end 2009 desktop with its side panel off: the chassis open on the board, a tower cooler on the CPU, six
      // sticks of RAM, the graphics card, two hard drives, the DVD writer and the power supply with its cables; on its
      // front the drive bays, the mesh and the power and reset buttons, on its back the ports. A 20-inch screen shows
      // Bitcoin 0.1 open on Windows XP, generating; a full keyboard, and the mouse on its pad.
      const tx = -0.42, tw = mm(205), th = mm(470), td = mm(470), hf = 0.014, t = 0.01, fz = 0.03;
      const x0 = tx - tw / 2, x1 = tx + tw / 2, z0 = -td / 2, z1 = td / 2, top = hf + th, inZ = (z0 + fz + z1 - t) / 2, inD = td - fz - t;
      for (const fx of [x0 + 0.03, x1 - 0.03]) for (const fzz of [z0 + 0.05, z1 - 0.05]) Y(0.016, 0.02, hf, "#0c0c0e", fx, hf / 2, fzz, { seg: 10 });
      B(tw, th, fz, "#141518", tx, hf + th / 2, z0 + fz / 2);
      B(tw, th, t, "#1a1b1e", tx, hf + th / 2, z1 - t / 2);
      B(tw, t, inD, "#16171a", tx, top - t / 2, inZ);
      B(tw, t, inD, "#16171a", tx, hf + t / 2, inZ);
      B(t, th - 2 * t, inD, "#16171a", x1 - t / 2, hf + th / 2, inZ);
      // The board on its tray, and on it the CPU's tower cooler (base, heat pipes, fins and its fan), the RAM in its
      // slots, the chipset's heatsink and the expansion slots.
      const xb = x1 - t - 0.004, cy = 0.6, cz = 0.16, fin = 0.19;
      B(0.004, mm(305), mm(244), "#1f2a24", xb + 0.002, top - t - 0.02 - mm(152.5), z1 - t - 0.02 - mm(122));
      B(0.022, 0.07, 0.07, "#b9bec4", xb - 0.011, cy, cz);
      for (let i = 0; i < 4; i++) Y(0.005, 0.005, 0.22, "#b87333", xb - 0.13, cy - 0.03 + i * 0.02, cz, { rz: HALF, seg: 8 });
      for (let i = 0; i < 16; i++) B(0.002, fin, fin, "#c9ccd2", xb - 0.05 - i * 0.012, cy, cz);
      fan(T.face("-z", xb - 0.14, cy, cz - fin / 2), fin);
      for (let i = 0; i < 6; i++) {
        const z = 0.012 - i * 0.0105;
        B(0.006, 0.23, 0.0085, "#111214", xb - 0.003, cy + 0.01, z);
        B(0.05, 0.213, 0.005, i % 2 ? "#2b67cf" : "#2f6fd6", xb - 0.028, cy + 0.01, z);
        B(0.004, 0.2, 0.0085, "#1d3f8a", xb - 0.055, cy + 0.01, z);
      }
      B(0.03, 0.05, 0.06, "#7f868e", xb - 0.015, 0.48, 0.17);
      for (let i = 0; i < 4; i++) B(0.012, 0.05, 0.004, "#9aa1a9", xb - 0.036, 0.48, 0.148 + i * 0.015);
      for (const yy of [0.44, 0.29, 0.26]) B(0.006, 0.01, 0.14, "#0e0f11", xb - 0.003, yy, 0.27);
      // The graphics card in the top slot: its shroud, the red stripe and its name on the edge we see, the blower
      // under it and its two power plugs.
      const gy = 0.41, gz = z1 - t - 0.2135, gx = xb - 0.095, ge = xb - 0.184;
      B(0.178, 0.061, 0.427, "#191a1c", gx, gy, gz);
      const G = T.face("-x", ge, gy, gz);
      G.B(0.3, 0.012, LIFT, "#c8102e", 0, 0.014, -LIFT / 2);
      G.say("HD 4870", 0.0028, "#e8e8e8", -0.13, -0.012, -0.0035, 0.4);
      blower(T.face("-y", gx, gy - 0.0305, gz - 0.12), 0.042);
      for (const dz of [-0.016, 0.016]) T.face("-x", ge, gy, gz - 0.18 + dz).B(0.024, 0.018, 0.012, "#0b0b0d", 0, 0, -0.006);
      // The power supply at the foot, its sticker, and its cables: two to the card, the board's 24-pin.
      const psx = x1 - t - 0.122, psy = hf + t + 0.069, psz = z1 - t - 0.128;
      B(0.24, 0.138, 0.256, "#2b2d31", psx, psy, psz);
      const Ps = T.face("-x", psx - 0.12, psy, psz);
      Ps.B(0.14, 0.08, LIFT, C.label, 0, 0, -LIFT / 2);
      Ps.say("850 W", 0.0042, C.ink, 0, 0.012, -0.0035, 0.1);
      Ps.B(0.1, 0.006, LIFT, "#c8102e", 0, -0.02, -LIFT - LIFT / 2);
      T.cable([[ge - 0.016, gy, gz - 0.18], [ge - 0.016, 0.12, gz - 0.18], [ge - 0.016, 0.12, psz - 0.128]], 0.012, "#111113");
      T.cable([[xb - 0.05, 0.1, psz - 0.128], [xb - 0.05, 0.1, -0.06], [xb - 0.05, 0.45, -0.06], [xb - 0.02, 0.45, -0.06]], 0.022, "#141416");
      B(0.02, 0.06, 0.018, "#e9e7e0", xb - 0.01, 0.45, -0.036);
      // The drive cage at the front: two hard drives with their stickers and red SATA cables, and the DVD writer.
      const hx = x0 + 0.105, hz = z0 + fz + 0.123;
      for (const sx of [-1, 1]) B(0.004, 0.22, 0.24, "#3a3d42", hx + sx * 0.0855, 0.16, hz);
      [0.09, 0.15].forEach((yy, i) => {
        B(0.163, 0.042, 0.235, "#a9adb3", hx, yy, hz);
        const D = T.face("+y", hx, yy + 0.021, hz);
        D.B(0.11, 0.15, LIFT, "#e9e9e9", 0, 0.02, -LIFT / 2);
        D.say("500 GB", 0.003, C.ink, 0, 0.05, -0.0035, 0.1);
        T.cable([[hx + 0.05, yy, hz + 0.118], [hx + 0.05, yy, -0.085 - i * 0.012], [xb - 0.02, yy, -0.085 - i * 0.012], [xb - 0.02, 0.3 + i * 0.03, -0.085 - i * 0.012], [xb - 0.02, 0.3 + i * 0.03, -0.04]], 0.008, "#c8102e");
      });
      B(0.234, 0.066, 0.272, "#26282c", (x0 + xb) / 2, top - t - 0.05, z0 + fz + 0.136);
      // The front: the DVD writer's face with its tray seam, eject button and light; a blank bay; the power button
      // in its blue ring, reset and the lights; the mesh; and the front ports on top.
      const Fr = T.face("-z", tx, 0, z0), ody = top - t - 0.05;
      Fr.B(0.234, 0.066, 0.004, "#202226", 0, ody, -0.002);
      Fr.B(0.2, 0.0025, LIFT, "#0a0a0b", 0, ody + 0.012, -0.005);
      Fr.B(0.016, 0.006, LIFT, "#3a3c40", -0.09, ody - 0.02, -0.005);
      Fr.lit(0.006, 0.003, LIFT, "#3cff6a", -0.06, ody - 0.02, -0.005);
      Fr.B(0.234, 0.066, 0.004, "#1b1c1f", 0, ody - 0.072, -0.002);
      Fr.Y(0.026, 0.026, 0.006, "#202226", 0, 0.52, -0.003, { rx: HALF, seg: 18 });
      Fr.R(0.03, 0.004, "#2b6fd8", 0, 0.52, -0.003, { rx: HALF, seg: 18, sides: 4, emissive: 0.9, glow: true });
      Fr.Y(0.008, 0.008, 0.004, "#2a2c30", -0.07, 0.52, -0.002, { rx: HALF, seg: 10 });
      Fr.lit(0.006, 0.006, LIFT, "#4aa3ff", 0.06, 0.53, -0.001);
      Fr.lit(0.006, 0.006, LIFT, "#ff4a3d", 0.06, 0.51, -0.001);
      for (let i = 0; i < 19; i++) Fr.B(tw * 0.78, 0.008, LIFT, "#0b0b0c", 0, 0.05 + i * 0.022, -0.001);
      const Tp = T.face("+y", tx, top, z0 + fz + 0.04);
      for (const lx of [0.06, 0.04]) Tp.B(0.014, 0.006, 0.004, "#0b0b0d", lx, 0, -0.002);
      [["#e88aa8", -0.04], ["#7cc576", -0.06]].forEach(([c, lx]) => Tp.Y(0.005, 0.005, 0.004, c, lx, 0, -0.002, { rx: HALF, seg: 10 }));
      // The back: the board's port shield, the card's bracket and the slot covers, the case fan's grille, and the
      // power supply's grille, inlet and switch.
      const Bk = T.face("+z", xb - 0.04, 0, z1);
      Bk.B(0.07, 0.25, LIFT, "#8e949b", 0, 0.6, -LIFT / 2);
      for (let i = 0; i < 4; i++) Bk.B(0.03, 0.026, 0.004, "#0b0b0d", 0, 0.68 - i * 0.04, -LIFT - 0.002);
      [["#e88aa8", -0.012], ["#7cc576", 0], ["#4aa3ff", 0.012]].forEach(([c, lx]) => Bk.Y(0.0045, 0.0045, 0.004, c, lx, 0.505, -LIFT - 0.002, { rx: HALF, seg: 10 }));
      Bk.B(0.11, 0.07, LIFT, "#3b3f45", 0.06, gy, -LIFT / 2);
      for (const ly of [-0.016, 0.016]) Bk.B(0.04, 0.014, 0.004, "#e8e8ea", 0.06, gy + ly, -LIFT - 0.002);
      for (let i = 0; i < 4; i++) Bk.B(0.11, 0.028, LIFT, "#7d838a", 0.06, 0.32 - i * 0.034, -LIFT / 2);
      const Ex = T.face("+z", xb - 0.17, cy, z1);
      Ex.Y(0.07, 0.07, LIFT, C.fanHole, 0, 0, -LIFT / 2, { rx: HALF, seg: 20 });
      for (const r of [0.03, 0.05, 0.068]) Ex.R(r, 0.003, C.guard, 0, 0, -0.006, { rx: HALF, seg: 20, sides: 3 });
      const Pr = T.face("+z", psx, psy, z1);
      Pr.Y(0.055, 0.055, LIFT, C.fanHole, -0.03, 0, -LIFT / 2, { rx: HALF, seg: 20 });
      for (const r of [0.025, 0.045]) Pr.R(r, 0.003, C.guard, -0.03, 0, -0.006, { rx: HALF, seg: 20, sides: 3 });
      Pr.B(0.04, 0.03, 0.006, "#0b0b0d", 0.07, 0.02, -0.003);
      Pr.B(0.012, 0.018, 0.006, "#c8102e", 0.07, -0.03, -0.003);
      // The screen on its stand, Windows XP's hill and sky on it, the taskbar, and Bitcoin 0.1's window: its title,
      // the menu and toolbar, the address, the balance, the transactions and the status bar, all as Satoshi's would
      // have read them while generating.
      // Its mains cords, the PC's and the screen's, and its network cable from the board's port, all off the back.
      const mx = 0.2, mw = mm(470), mh = mm(320), my = mm(110) + mh / 2, mz = 0.08;
      lead("mains", [[psx - 0.07, psy + 0.02, z1 + 0.006], [psx - 0.07, psy + 0.02, z1 + 0.06], [psx - 0.07, 0.009, z1 + 0.11], [psx - 0.07, 0.009, 0.5]], 0.012, "#151517", "c13");
      lead("mains", [[mx + 0.08, my - 0.1, mz + 0.066], [mx + 0.08, my - 0.12, mz + 0.13], [mx + 0.08, 0.009, 0.34], [mx + 0.08, 0.009, 0.5]], 0.009, "#151517", "c13");
      lead("lan", [[xb - 0.04, 0.68, z1 + 0.006], [xb - 0.04, 0.68, z1 + 0.06], [xb - 0.04, 0.006, z1 + 0.11], [xb - 0.04, 0.006, 0.5]], 0.007, "#2b6fd8", "rj45");
      B(mm(240), 0.014, mm(190), "#141518", mx, 0.007, mz + 0.06);
      B(mm(60), mm(180), mm(30), "#141518", mx, 0.014 + mm(90), mz + 0.075);
      B(mw, mh, 0.03, "#121316", mx, my, mz);
      B(mw * 0.62, mh * 0.6, 0.045, "#16171a", mx, my - 0.02, mz + 0.0375);
      const S = T.face("-z", mx, 0, mz - 0.015);
      S.lit(0.006, 0.006, LIFT, "#4aa3ff", -mw / 2 + 0.03, my - mh / 2 + 0.012, -LIFT / 2, 0.9);
      for (let i = 0; i < 4; i++) S.B(0.008, 0.004, LIFT, "#2a2c30", -mw / 2 + 0.06 + i * 0.022, my - mh / 2 + 0.012, -LIFT / 2);
      const sw = mw - 0.06, sh = mh - 0.074, sy = my + 0.006;
      S.B(mw - 0.036, mh - 0.05, LIFT, "#0b0e12", 0, sy, -LIFT / 2);
      S.lit(sw, sh * 0.58, LIFT, "#4d82d6", 0, sy + sh * 0.21, lay(0), 0.75);
      S.lit(sw, sh * 0.42, LIFT, "#4c9a2a", 0, sy - sh * 0.29, lay(0), 0.75);
      for (const [cx, cy2, w2] of [[-sw * 0.33, sy + sh * 0.38, 0.09], [-sw * 0.42, sy + sh * 0.27, 0.06]]) S.lit(w2, 0.014, LIFT, "#eef3ff", cx, cy2, lay(1), 0.8);
      const bar = sy - sh / 2 + 0.014;
      S.lit(sw, 0.028, LIFT, "#245edb", 0, bar, lay(1), 0.8);
      S.lit(0.075, 0.024, LIFT, "#3c9a3c", sw / 2 - 0.042, bar, lay(2), 0.85);
      S.say("START", 0.0022, "#ffffff", sw / 2 - 0.044, bar, ink(2), 0.9);
      S.lit(0.08, 0.024, LIFT, "#1b8de6", -sw / 2 + 0.045, bar, lay(2), 0.85);
      S.say("10:35 PM", 0.0016, "#ffffff", -sw / 2 + 0.045, bar, ink(2), 0.9);
      const ww = sw * 0.66, wh = sh * 0.8, wx = sw * 0.08, wy = sy - sh / 2 + 0.04 + wh / 2, wl = wx + ww / 2, wt = wy + wh / 2;
      S.lit(ww, wh, LIFT, "#ece9d8", wx, wy, lay(1), 0.75);
      S.lit(ww, 0.03, LIFT, "#0a58ca", wx, wt - 0.015, lay(2), 0.85);
      S.lit(0.016, 0.016, LIFT, "#f7931a", wl - 0.016, wt - 0.015, lay(3), 0.9);
      S.say("BITCOIN", 0.0026, "#ffffff", wl - 0.075, wt - 0.015, ink(2), 0.95);
      S.lit(0.02, 0.02, LIFT, "#d8402b", wx - ww / 2 + 0.015, wt - 0.015, lay(3), 0.9);
      S.say("X", 0.0022, "#ffffff", wx - ww / 2 + 0.015, wt - 0.015, ink(3), 0.95);
      for (const i of [1, 2]) S.lit(0.02, 0.02, LIFT, "#3b77e6", wx - ww / 2 + 0.015 + i * 0.024, wt - 0.015, lay(3), 0.9);
      // Words too small to read at this size stand as grey strokes, as they would to the eye.
      const words = (list, yy, n, color = "#6a6a6a", from = wl - 0.014) => { let x = from; for (const w2 of list) { S.lit(w2, 0.006, LIFT, color, x - w2 / 2, yy, lay(n), 0.6); x -= w2 + 0.012; } };
      words([0.024, 0.044, 0.028], wt - 0.042, 2, "#3a3a3a");
      for (const [i, bw] of [[0, 0.1], [1, 0.12]]) {
        const bx = wl - 0.012 - (i ? 0.1 + 0.012 : 0) - bw / 2;
        S.lit(bw, 0.026, LIFT, "#f6f5f0", bx, wt - 0.072, lay(2), 0.75);
        S.lit(bw * 0.7, 0.006, LIFT, "#3a3a3a", bx, wt - 0.072, lay(3), 0.6);
      }
      words([0.07], wt - 0.106, 2, "#3a3a3a");
      S.lit(0.2, 0.022, LIFT, "#ffffff", wl - 0.1 - 0.2 / 2, wt - 0.106, lay(2), 0.8);
      S.lit(0.16, 0.006, LIFT, "#3a3a3a", wl - 0.1 - 0.2 / 2, wt - 0.106, lay(3), 0.6);
      S.say("BALANCE: 50.00", 0.0026, "#1a1a1a", wl - 0.014 - 0.109, wt - 0.142, ink(1), 0.5);
      const listTop = wt - 0.162, listH = wh - 0.162 - 0.034;
      S.lit(ww - 0.024, listH, LIFT, "#ffffff", wx, listTop - listH / 2, lay(2), 0.8);
      S.lit(ww - 0.024, 0.02, LIFT, "#dcd8c8", wx, listTop - 0.01, lay(3), 0.75);
      for (let r = 0; r < 4; r++) {
        let x = wl - 0.026;
        for (const w2 of [0.06, 0.05, 0.11, 0.04]) { S.lit(w2, 0.006, LIFT, r ? "#5a5a5a" : "#2a2a2a", x - w2 / 2, listTop - 0.01 - (r ? 0.014 + r * 0.024 : 0), lay(r ? 3 : 4), 0.6); x -= w2 + 0.03; }
      }
      S.lit(ww, 0.022, LIFT, "#e0dccb", wx, wy - wh / 2 + 0.011, lay(2), 0.75);
      S.say("GENERATING", 0.0018, "#1a1a1a", wl - 0.014 - 0.0531, wy - wh / 2 + 0.011, ink(2), 0.5);
      words([0.05, 0.06], wy - wh / 2 + 0.011, 3, "#5a5a5a", wl - 0.14);
      // A full 2009 keyboard: the main block, the arrows and the block over them, the number pad and its lights;
      // the mouse on its pad, its cable running under the tower.
      const kx = 0.13, kz = -0.47, u = mm(19), left = kx + 11.45 * u;
      B(u * 22.9, 0.022, u * 6.6, "#18191c", kx, 0.011, kz);
      const key = (x, z, w2) => B(w2 * u - 0.005, 0.012, u - 0.005, "#26282c", x - w2 * u / 2, 0.028, z);
      const ROWS = [[1, -1, 1, 1, 1, 1, -0.5, 1, 1, 1, 1, -0.5, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2], [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
        [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25], [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75], [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25]];
      ROWS.forEach((row, r) => {
        const z = kz + (2.6 - r - (r ? 0.3 : 0)) * u;
        let x = left - 0.2 * u;
        for (const w2 of row) { if (w2 > 0) key(x, z, w2); x -= Math.abs(w2) * u; }
      });
      const nav = left - 15.4 * u;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) key(nav - c * u, kz + (1.3 - r) * u, 1);
      for (const [c, r] of [[1, 3], [0, 4], [1, 4], [2, 4]]) key(nav - c * u, kz + (1.3 - r) * u, 1);
      const pad = left - 18.6 * u;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
        if (c === 3 && (r === 2 || r === 4) || r === 4 && c === 1) continue;
        const tallKey = c === 3 && (r === 1 || r === 3), wide = r === 4 && c === 0;
        B((wide ? 2 : 1) * u - 0.005, 0.012, (tallKey ? 2 : 1) * u - 0.005, "#26282c", pad - c * u - (wide ? u : u / 2), 0.028, kz + (1.3 - r - (tallKey ? 0.5 : 0)) * u);
      }
      for (let i = 0; i < 3; i++) lit(0.004, LIFT, 0.004, i === 0 ? C.led : "#203024", pad - 1.2 * u - i * 0.02, 0.023, kz + 2.9 * u, i ? 0 : 0.9);
      const mox = -0.33, moz = -0.47;
      B(0.22, 0.003, 0.2, "#2a2c30", mox, 0.0015, moz);
      B(0.064, 0.022, 0.104, "#1d1e21", mox, 0.003 + 0.011, moz);
      B(0.05, 0.008, 0.06, "#26282c", mox, 0.025 + 0.004, moz - 0.012);
      B(0.002, LIFT, 0.05, "#0c0c0e", mox, 0.033 + LIFT / 2, moz - 0.02);
      Y(0.008, 0.008, 0.007, "#4a4d52", mox, 0.032, moz - 0.03, { rz: HALF, seg: 10 });
      T.cable([[mox, 0.007, moz + 0.055], [mox, 0.007, 0.0]], 0.006, "#121214");
      return wire();
    }
    if (kind === "gpu") {
      // A 2010 open rig: an aluminium frame, the board on its floor, and four Radeon HD 5870s hung on the top bar,
      // each fed by a riser ribbon from its slot and two power cables from the big power supply beside the frame.
      for (const [x, z] of [[-0.3, -0.27], [0.3, -0.27], [-0.3, 0.27], [0.3, 0.27]]) {
        B(0.025, 0.448, 0.025, C.alu, x, 0.236, z);
        for (const sx of [-1, 1]) B(LIFT, 0.4, 0.006, "#5b6168", x + sx * (0.0125 + LIFT / 2), 0.226, z);
      }
      for (const z of [-0.27, 0.27]) B(0.575, 0.02, 0.02, C.alu, 0, 0.45, z);
      B(0.58, 0.02, 0.02, C.alu, 0, 0.45, 0);
      for (const x of [-0.3, 0.3]) B(0.02, 0.02, 0.515, C.alu, x, 0.45, 0);
      B(0.62, 0.012, 0.56, "#9aa0a8", 0, 0.006, 0);
      const bx = -0.05, bz = 0.02, by = 0.012;
      B(mm(244), 0.004, mm(305), "#1c2b22", bx, by + 0.002, bz);
      // The slots sit apart from the cards over them, so no ribbon runs up where another does.
      const slots = [-0.22, -0.15, -0.08, -0.01];
      for (const x of slots) B(0.012, 0.01, 0.14, "#0c0c0e", x, by + 0.009, -0.05);
      B(0.07, 0.03, 0.07, "#9aa0a8", bx + 0.04, by + 0.019, bz + 0.12);
      fan(T.face("+y", bx + 0.04, by + 0.034, bz + 0.12), 0.07);
      for (const x of [bx + 0.115, bx + 0.13]) B(0.006, 0.05, 0.21, "#2f6fd6", x, by + 0.029, bz + 0.05);
      B(0.03, 0.012, 0.02, "#e9e7e0", bx + 0.16, by + 0.01, bz - 0.12);
      B(0.012, 0.02, 0.006, "#c9ccd2", bx - 0.19, by + 0.014, bz + 0.25);
      B(0.016, 0.012, 0.03, "#2556b4", bx - 0.19, by + 0.014, bz + 0.27);
      const cards = [-0.18, -0.06, 0.06, 0.18], CY = 0.329, CL = 0.427, CW = 0.061;
      cards.forEach((x, i) => {
        B(CW, 0.178, CL, "#18181a", x, CY, 0);
        const L = T.face("-x", x - CW / 2, CY, 0);
        L.B(0.26, 0.012, LIFT, "#c8102e", 0.08, 0.05, -LIFT / 2);
        L.B(0.26, 0.012, LIFT, "#c8102e", 0.08, -0.05, -LIFT / 2);
        L.say("HD 5870", 0.003, "#e8e8e8", 0.08, 0, -0.0035, 0.4);
        blower(T.face("-x", x - CW / 2, CY - 0.01, 0.12), 0.05);
        const Br = T.face("-z", x, CY, -CL / 2);
        Br.B(CW + 0.004, 0.2, 0.004, "#b8bec6", 0, 0.01, -0.002);
        for (const yy of [0.05, 0.015]) Br.B(0.03, 0.014, 0.004, "#e8e8ea", 0, yy, -0.006);
        for (let v = 0; v < 4; v++) Br.B(0.04, 0.006, LIFT, "#2a2c30", 0, -0.03 - v * 0.014, -0.005);
        for (const dz of [0.15, 0.18]) B(0.03, 0.01, 0.022, "#0b0b0d", x, CY + 0.089 + 0.005, dz);
        // Its riser ribbon up from its slot, across and up to the card, each one's run lower than the last so none
        // crosses another; and its power cables over to the supply.
        const sx = slots[i], ry = 0.136 - i * 0.012, y0 = by + 0.016, y1 = CY - 0.089, cz = 0.155 + i * 0.008;
        T.ribbon([[sx, y0, -0.05], [sx, ry, -0.05], [x, ry, -0.05], [x, y1, -0.05]], 0.05, 0.003, "#8d9db6", [0, 0, 1]);
        T.cable([[x, CY + 0.099, cz], [x, 0.433, cz], [0.29, 0.433, cz], [0.29, 0.03 + i * 0.016, cz], [0.311, 0.03 + i * 0.016, cz]], 0.008, "#151517");
      });
      // The power supply beside the frame, lying long, its fan on top, its sockets and its label.
      const px = 0.455, pw = mm(180), ph = mm(86), pd = mm(150), pz = 0.165;
      B(pw, ph, pd, "#26282c", px, ph / 2, pz);
      grille(T.face("+y", px + 0.03, ph, pz), 0.19);
      const Pl = T.face("-z", px, 0, pz - pd / 2);
      Pl.B(0.16, 0.07, LIFT, C.label, 0, ph / 2, -LIFT / 2);
      Pl.say("1200 W", 0.0045, C.ink, 0, ph / 2 + 0.008, -0.0035, 0.1);
      // The supply's inlet and its mains cord off the back; the board's network port and its cable.
      T.face("+z", 0.42, ph / 2, pz + pd / 2).B(0.04, 0.03, 0.006, "#0b0b0d", 0, 0, -0.003);
      lead("mains", [[0.42, ph / 2, pz + pd / 2 + 0.006], [0.42, ph / 2, pz + pd / 2 + 0.06], [0.42, 0.009, pz + pd / 2 + 0.11], [0.42, 0.009, 0.5]], 0.012, "#151517", "c13");
      B(0.024, 0.02, 0.03, "#b8bec6", bx + 0.12, by + 0.014, bz + mm(152.5) - 0.012);
      lead("lan", [[bx + 0.12, by + 0.014, bz + mm(152.5) + 0.003], [bx + 0.12, by + 0.014, 0.33], [bx + 0.12, 0.006, 0.4], [bx + 0.12, 0.006, 0.5]], 0.007, "#2b6fd8", "rj45");
      return wire();
    }
    if (kind === "pool") {
      // A pool is an idea, not a machine: here the rack that ran one, a 10-inch frame holding its switch, two
      // servers and a UPS, and four rigs round its foot, each cabled to the switch.
      const rw = 0.41, rh = 0.62, rd = 0.33, px0 = rw / 2 - 0.015, pz0 = rd / 2 - 0.015;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(0.03, rh, 0.03, "#1b1c20", sx * px0, rh / 2, sz * pz0);
      for (const yy of [0.012, rh - 0.012]) {
        for (const sz of [-1, 1]) B(rw - 0.06, 0.024, 0.024, "#232428", 0, yy, sz * pz0);
        for (const sx of [-1, 1]) B(0.024, 0.024, rd - 0.06, "#232428", sx * px0, yy, 0);
      }
      const U = mm(44.45), front = -pz0 - 0.015;
      // Each piece: a box between the posts, and its face across them.
      const unit = (n, yy, color, body) => {
        B(rw - 0.064, n * U - 0.004, rd - 0.05, body, 0, yy, 0);
        const F = T.face("-z", 0, yy, front);
        F.B(rw, n * U - 0.004, 0.004, color, 0, 0, -0.002);
        for (const sx of [-1, 1]) screw(F, sx * (rw / 2 - 0.012), 0, 0.004, -0.004);
        return F;
      };
      const sw = unit(1, rh - 0.06, "#2e3137", "#1f2125");
      for (let p = 0; p < 16; p++) {
        const x = 0.14 - (p % 8) * 0.032, yy = p < 8 ? 0.011 : -0.011;
        sw.B(0.018, 0.016, 0.004, "#0b0b0d", x, yy, -0.006);
        sw.lit(0.003, 0.003, LIFT, p % 3 ? C.led : C.amber, x + 0.007, yy + 0.0065, -0.009, p % 2 ? 0.95 : 0.3);
      }
      sw.say("POOL", 0.003, "#cfd3d8", -0.145, 0, -0.0055, 0.6);
      [rh - 0.06 - U * 1.5 - 0.01, rh - 0.06 - U * 3.5 - 0.02].forEach((yy) => {
        const sv = unit(2, yy, "#30343a", "#202226");
        for (let b = 0; b < 4; b++) {
          const x = 0.12 - b * 0.07;
          sv.B(0.062, 0.05, 0.004, "#45494f", x, -0.01, -0.006);
          sv.B(0.05, 0.008, LIFT, "#6d7178", x, -0.025, -0.009);
          sv.lit(0.004, 0.004, LIFT, b % 2 ? C.led : "#4aa3ff", x + 0.024, 0.008, -0.009);
        }
        sv.Y(0.008, 0.008, 0.004, "#3a3d42", -0.17, 0.03, -0.006, { rx: HALF, seg: 10 });
        sv.lit(0.004, 0.004, LIFT, C.led, -0.17, 0.012, -0.005);
      });
      const ups = unit(2, 0.024 + U + 0.006, "#2a2c30", "#1c1d20");
      ups.lit(0.06, 0.03, LIFT, "#2f7fd6", 0.06, 0.006, -0.005, 0.8);
      ups.say("230V", 0.0022, "#e8f4ff", 0.06, 0.006, -0.0085, 0.9);
      for (let b = 0; b < 3; b++) ups.Y(0.006, 0.006, 0.004, "#3a3d42", -0.06 - b * 0.03, 0, -0.006, { rx: HALF, seg: 10 });
      // The UPS's inlet at its back and its mains cord; the switch's uplink, from its last port round the rack and back.
      const upsBack = (rd - 0.05) / 2;
      T.face("+z", 0.08, 0.06, upsBack).B(0.04, 0.03, 0.006, "#0b0b0d", 0, 0, -0.003);
      lead("mains", [[0.08, 0.06, upsBack + 0.006], [0.08, 0.06, upsBack + 0.07], [0.08, 0.009, upsBack + 0.13], [0.08, 0.009, 0.5]], 0.012, "#151517", "c13");
      lead("lan", [[0.14 - 7 * 0.032, rh - 0.06 + 0.011, front - 0.01], [-0.084, rh - 0.049, front - 0.06], [-0.26, rh - 0.06, front - 0.06], [-0.26, 0.035, front - 0.06], [-0.26, 0.035, -0.15], [-0.26, 0.006, -0.08], [-0.26, 0.006, 0.5]], 0.007, "#2b6fd8", "rj45");
      // Four rigs round its foot, each an open frame with two cards and its own light, cabled to the switch.
      [[-0.42, -0.36], [0.42, -0.36], [-0.42, 0.2], [0.42, 0.2]].forEach(([x, z], i) => {
        const m = 0.16;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(0.012, m - 0.006, 0.012, C.alu, x + sx * (m / 2 - 0.006), (m + 0.006) / 2, z + sz * (m / 2 - 0.006));
        for (const sz of [-1, 1]) B(m - 0.024, 0.01, 0.01, C.alu, x, m - 0.005, z + sz * (m / 2 - 0.006));
        B(m - 0.01, 0.006, m - 0.01, "#9aa0a8", x, 0.003, z);
        for (const dx of [-0.03, 0.03]) {
          B(0.022, 0.07, 0.12, "#18181a", x + dx, 0.06, z);
          T.face("-z", x + dx, 0.06, z - 0.06).B(0.026, 0.074, 0.003, "#b8bec6", 0, 0, -0.0015);
          T.face("-x", x + dx - 0.011, 0.06, z).B(0.09, 0.006, LIFT, "#c8102e", 0, 0.025, -LIFT / 2);
        }
        T.face("-z", x - m / 2 + 0.006, m - 0.03, z - m / 2).lit(0.006, 0.006, LIFT, C.led, 0, 0, -LIFT / 2);
        // Its slim power supply on the frame's floor at its outer side, and its mains cord round the outside to the back.
        const sx = Math.sign(x), lane = z < 0 ? 0.56 : 0.53;
        B(0.024, 0.04, 0.1, "#26282c", x + sx * 0.055, 0.026, z);
        lead("mains", [[x + sx * 0.067, 0.026, z], [x + sx * 0.11, 0.026, z], [sx * lane, 0.009, z + 0.05], [sx * lane, 0.009, 0.5]], 0.008, "#151517", "c13");
        // Each its own run to the floor and across, the back pair over the front pair where they cross.
        const jx = 0.14 - (i % 8) * 0.032, jy = rh - 0.06 + 0.011, cz = front - 0.04 - i * 0.012, cx = x + (i < 2 ? 0.03 : -0.03), cy = i < 2 ? 0.006 : 0.0145;
        T.cable([[jx, jy, front - 0.012], [jx, jy, cz], [jx, cy, cz], [cx, cy, cz], [cx, cy, z]], 0.008, i % 2 ? "#2b6fd8" : "#e2c24a");
      });
      return wire();
    }
    if (kind === "fpga") {
      // Two X6500 boards on brass standoffs: on each two Spartan-6 FPGAs under finned heatsinks with their fans, the
      // power regulators and their coils, capacitors, the USB port, the power plug, the JTAG header and the lights.
      for (const z of [-0.12, 0.12]) {
        const bw = 0.24, bd = 0.16, by = 0.05, top = by + 0.0016;
        for (const [x, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) Y(0.006, 0.006, by, "#c9a23a", x * bw * 0.44, by / 2, z + dz * bd * 0.42, { seg: 6 });
        B(bw, 0.0032, bd, "#18241c", 0, by, z);
        const P2 = T.face("+y", 0, top, z);
        P2.say("X6500", 0.0032, "#e8e8e8", 0, 0.05, -0.0015, 0.2);
        for (const x of [-0.06, 0.06]) {
          B(0.045, 0.004, 0.045, "#1a1a1a", x, top + 0.002, z);
          B(0.064, 0.006, 0.064, "#c9ccd2", x, top + 0.007, z);
          for (let f = 0; f < 7; f++) B(0.064, 0.02, 0.003, "#c9ccd2", x, top + 0.02, z - 0.03 + f * 0.01);
          fan(T.face("+y", x, top + 0.03, z), 0.064);
        }
        for (let i = 0; i < 4; i++) B(0.012, 0.008, 0.012, "#5c6067", -0.1 + i * 0.02 + (i > 1 ? 0.14 : 0), top + 0.004, z + 0.06);
        for (let i = 0; i < 6; i++) Y(0.004, 0.004, 0.01, "#1d1e21", -0.105 + i * 0.012 + (i > 2 ? 0.17 : 0), top + 0.005, z - 0.045, { seg: 8 });
        B(0.02, 0.008, 0.016, "#c9ccd2", -bw / 2 + 0.012, top + 0.004, z - bd / 2 + 0.014);
        B(0.026, 0.016, 0.022, "#f1efe6", bw / 2 - 0.016, top + 0.008, z - bd / 2 + 0.016);
        B(0.03, 0.01, 0.012, "#0c0c0e", 0, top + 0.005, z + bd / 2 - 0.012);
        for (const dx of [-0.008, 0.008]) lit(0.005, 0.003, 0.004, dx < 0 ? C.led : C.amber, dx, top + 0.0015, z - bd / 2 + 0.01);
      }
      // A 12 V brick behind the boards, a lead to each board's power plug, and the brick's mains cord.
      B(0.12, 0.04, 0.07, "#1a1a1c", -0.02, 0.02, 0.33);
      [-0.12, 0.12].forEach((z, i) => T.cable([[0.121, 0.06, z - 0.064], [0.16 + i * 0.016, 0.06, z - 0.064], [0.16 + i * 0.016, 0.009, z - 0.02], [0.16 + i * 0.016, 0.009, 0.31 + i * 0.02], [0.044, 0.012, 0.31 + i * 0.02]], 0.006, "#151517"));
      lead("mains", [[-0.084, 0.02, 0.33], [-0.12, 0.009, 0.33], [-0.12, 0.009, 0.5]], 0.009, "#151517");
      return wire();
    }
    if (kind === "avalon") {
      // Avalon's first batch: a black steel box on rubber feet, the orange band, its big front fan behind the guard,
      // vents down its side, the ports and inlet at the back, and its power cord and network cable off the back.
      const aw = mm(200), ah = mm(320), ad = mm(300), ax = 0, af = 0.012;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) Y(0.012, 0.014, af, "#0c0c0e", ax + sx * (aw / 2 - 0.03), af / 2, sz * (ad / 2 - 0.03), { seg: 10 });
      B(aw, ah, ad - 0.03, "#232327", ax, af + ah / 2, 0.015);
      bay("-z", ax, af, -ad / 2, aw, ah, [af + ah * 0.42], aw * 0.82, "#232327", 0.03);
      lit(aw + 2 * LIFT, 0.03, ad + 2 * LIFT, "#f28a1a", ax, af + ah - 0.06, 0, 0.9);
      T.face("-z", ax, af + ah - 0.112, -ad / 2).say("AVALON", 0.006, "#f2f2f2", 0, 0, -0.0015, 0.4);
      const Sd = T.face("+x", ax + aw / 2, 0, 0);
      for (let r = 0; r < 7; r++) Sd.B(ad * 0.7, 0.006, LIFT, "#121214", 0, af + 0.08 + r * 0.045, -LIFT / 2);
      const Bk = T.face("+z", ax, 0, ad / 2);
      Bk.B(0.04, 0.03, 0.006, "#0b0b0d", 0.05, af + 0.08, -0.003);
      Bk.B(0.017, 0.014, 0.006, "#0b0b0d", -0.04, af + 0.2, -0.003);
      Bk.lit(0.004, 0.004, LIFT, C.led, -0.04, af + 0.215, -0.007);
      lead("mains", [[ax - 0.05, af + 0.08, ad / 2 + 0.006], [ax - 0.05, af + 0.08, ad / 2 + 0.06], [ax - 0.05, 0.009, ad / 2 + 0.12], [ax - 0.05, 0.009, 0.5]], 0.012, "#151517", "c13");
      lead("lan", [[ax + 0.04, af + 0.2, ad / 2 + 0.006], [ax + 0.04, af + 0.2, ad / 2 + 0.06], [ax + 0.04, 0.006, ad / 2 + 0.12], [ax + 0.04, 0.006, 0.5]], 0.007, "#2b6fd8", "rj45");
      return wire();
    }
    if (kind === "erupter") {
      // ASICMiner's USB Block Erupters, seven of them standing in a powered USB hub: each a blue board on a gold
      // heatsink with its light, the hub's own lights under them; the hub's power brick and its cord, its lead to an
      // open 2013 laptop running the miner; and the little desk fan their owners set blowing across them.
      const hx = -0.16, hy = mm(22);
      B(mm(150), hy, mm(55), "#e9e9e6", hx, hy / 2, 0);
      for (let i = 0; i < 7; i++) {
        const x = hx - 0.105 + i * 0.035, sy = hy + mm(50);
        T.face("-z", x, hy / 2, -mm(27.5)).lit(0.004, 0.004, LIFT, "#4aa3ff", 0, 0, -LIFT / 2, 0.95);
        B(mm(13), mm(14), mm(5), "#c9ccd2", x, hy + mm(7), 0);
        B(mm(3), mm(86), mm(28), "#2556b4", x, sy + mm(4), 0);
        B(mm(8), mm(52), mm(26), "#c9a23a", x + mm(6), sy + mm(6), 0);
        for (let f = 0; f < 4; f++) B(mm(10), mm(46), 0.003, "#d6b14a", x + mm(13), sy + mm(6), -mm(10) + f * mm(6.5));
        T.face("-x", x - mm(1.5), sy + mm(38), mm(8)).lit(0.004, 0.004, LIFT, C.led, 0, 0, -LIFT / 2);
      }
      // The power brick behind the hub, and its mains cord.
      B(mm(62), mm(30), mm(42), "#1a1a1c", hx, mm(15), 0.2);
      T.cable([[hx, hy * 0.5, mm(27.5) + 0.004], [hx, 0.008, 0.1], [hx, 0.008, 0.2 - mm(21) - 0.002]], 0.008, "#151517");
      lead("mains", [[hx, mm(15), 0.2 + mm(21) + 0.004], [hx, 0.009, 0.3], [hx, 0.009, 0.5]], 0.009, "#151517");
      // The laptop, a silver 2013 one open toward the visitor: its base with the keyboard and trackpad, and the lid
      // with the miner's log on its screen.
      const lx = 0.3, lz = 0.06, W = mm(325), Hb = mm(17), D = mm(227), Hl = mm(212);
      B(W, Hb, D, "#b9bdc3", lx, Hb / 2, lz);
      const kz = lz + D * 0.1, u = W * 0.82 / 13;
      B(W * 0.86, LIFT, D * 0.44, "#1f2023", lx, Hb + LIFT / 2, kz);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 13; c++) B(u - 0.005, 0.004, u - 0.005, "#2c2d31", lx + (6 - c) * u, Hb + LIFT + 0.002, kz + (2 - r) * u);
      B(W * 0.3, LIFT, D * 0.22, "#c9cdd2", lx, Hb + LIFT / 2, lz - D * 0.31);
      const Lid = T.at(lx, Hb, lz + D / 2 - 0.007, 0, 0.26);
      Lid.B(W, Hl, 0.012, "#b9bdc3", 0, Hl / 2, 0);
      const Sc = Lid.face("-z", 0, 0, -0.006);
      Sc.B(W - 0.016, Hl - 0.016, LIFT, "#0b0c0e", 0, Hl / 2, -LIFT / 2);
      Sc.lit(W * 0.88, Hl * 0.8, LIFT, "#07140d", 0, Hl * 0.52, lay(0), 0.7);
      ["BFGMINER 3.1.1", "7 USB ERUPTERS FOUND", "ERU 0-6  336 MH/S EACH", "TOTAL  2.35 GH/S", "POOL  BTC GUILD", "ACCEPTED 1284  REJ 3"].forEach((line, i) =>
        Sc.say(line, 0.0034, i ? "#7cff8a" : "#ffd66b", 0, Hl * 0.83 - i * 0.042, ink(0), 0.6));
      // Its lead from the hub's end round to the laptop's side.
      T.cable([[hx + mm(75) + 0.004, hy * 0.5, 0], [-0.02, 0.008, 0.01], [-0.0, 0.008, 0.12], [lx - W / 2 - 0.004, Hb * 0.5, 0.12]], 0.007, "#151517");
      // The laptop's charger cord off its right side, its network cable off its left, and the fan's cord.
      lead("mains", [[lx + W / 2 - 0.004, Hb * 0.5, lz + 0.1], [lx + W / 2 + 0.02, Hb * 0.5, lz + 0.1], [0.585, 0.009, lz + 0.16], [0.585, 0.009, 0.5]], 0.007, "#e9e9e6");
      lead("lan", [[lx - W / 2, Hb * 0.5, 0.2], [0.0, Hb * 0.5, 0.2], [-0.02, 0.006, 0.26], [-0.02, 0.006, 0.5]], 0.006, "#2b6fd8", "rj45");
      lead("mains", [[-0.48, 0.007, -0.12], [-0.48, 0.007, -0.08], [-0.55, 0.008, 0.0], [-0.55, 0.008, 0.5]], 0.006, "#e9e9e6");
      // The desk fan: its base, stem, motor, four blades and the cage, blowing across the sticks.
      const fx = -0.48, fz = -0.18, fh = 0.2, Fn = T.at(fx, fh, fz, -2.06);
      Y(0.05, 0.056, 0.014, "#e9e9e6", fx, 0.007, fz, { seg: 16 });
      Y(0.008, 0.008, fh - 0.03, "#d6d6d2", fx, 0.014 + (fh - 0.03) / 2, fz, { seg: 10 });
      Fn.Y(0.024, 0.026, 0.05, "#e9e9e6", 0, 0, 0.03, { rx: HALF, seg: 14 });
      for (let b = 0; b < 4; b++) Fn.at(0, 0, -0.012, 0, 0, b / 4 * P.TAU).B(0.05, 0.03, 0.003, "#cfe3f5", 0.032, 0, 0, { rx: 0.4 });
      Fn.Y(0.012, 0.012, 0.012, "#e9e9e6", 0, 0, -0.012, { rx: HALF, seg: 10 });
      for (const r of [0.03, 0.06]) Fn.R(r, 0.0025, "#d6d6d2", 0, 0, -0.03, { rx: HALF, seg: 20, sides: 3 });
      Fn.R(0.064, 0.003, "#d6d6d2", 0, 0, -0.008, { rx: HALF, seg: 20, sides: 3 });
      for (let b = 0; b < 6; b++) Fn.B(0.128, 0.003, 0.003, "#d6d6d2", 0, 0, -0.03, { rz: b * Math.PI / 6 });
      return wire();
    }
    if (kind === "bitaxe") {
      // The Bitaxe Gamma, open hardware: its black board on standoffs, the BM1370's heatsink and fan, the ESP32-S3
      // module, the little screen showing its hashrate, the power stage's coils and capacitors, the USB-C port, the
      // barrel jack with its power cable, the BOOT button, its light, and BITAXE on the silkscreen.
      const bw = mm(100), bd = mm(76), by = 0.03, top = by + 0.002;
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) Y(0.006, 0.006, by, "#c9a23a", x * bw * 0.44, by / 2, z * bd * 0.42, { seg: 6 });
      B(bw, 0.004, bd, "#121417", 0, by, 0);
      T.face("+y", 0, top, 0).say("BITAXE", 0.002, "#e8e8e8", 0.035, -0.052, -0.0015, 0.2);
      const hx = 0.012, hz = 0.012;
      B(mm(40), 0.006, mm(40), "#c9ccd2", hx, top + 0.003, hz);
      for (let f = 0; f < 7; f++) B(mm(40), mm(14), 0.0025, "#c9ccd2", hx, top + 0.006 + mm(7), hz - mm(17) + f * mm(5.6));
      fan(T.face("+y", hx, top + 0.006 + mm(14), hz), mm(40));
      T.cable([[0.048, top + 0.02, 0.036], [0.054, top + 0.02, 0.036], [0.054, top + 0.004, 0.036]], 0.003, "#1c1c1c");
      B(mm(18), 0.0035, mm(25.5), "#c9ccd2", -0.052, top + 0.00175, 0.02);
      B(mm(16), 0.0015, mm(6), "#1d2a24", -0.052, top + 0.00075, 0.02 + mm(12.75) + mm(3));
      B(mm(30), 0.004, mm(14), "#1b2a4a", -0.03, top + 0.002, -bd / 2 + 0.016);
      B(mm(24), LIFT, mm(7), "#05070a", -0.03, top + 0.004 + LIFT / 2, -bd / 2 + 0.016);
      T.face("+y", -0.03, top + 0.004 + LIFT, -bd / 2 + 0.016).say("1.2 TH/S", 0.0008, "#bfe8ff", 0, 0, -0.0015, 0.95);
      for (let i = 0; i < 3; i++) B(0.012, 0.008, 0.012, "#5c6067", 0.062, top + 0.004, -0.03 + i * 0.016);
      for (let i = 0; i < 4; i++) Y(0.003, 0.003, 0.008, "#d8c79a", 0.075, top + 0.004, -0.032 + i * 0.012, { seg: 8 });
      B(0.014, 0.006, 0.01, "#9aa0a8", -bw / 2 + 0.006, top + 0.003, -0.02);
      B(0.02, 0.014, 0.024, "#0c0c0e", 0.068, top + 0.007, 0.035);
      lead("mains", [[0.078, top + 0.007, 0.035], [0.14, top + 0.007, 0.035], [0.14, 0.006, 0.08], [0.14, 0.006, 0.5]], 0.006, "#151517");
      B(0.006, 0.004, 0.006, "#2a2c30", -0.074, top + 0.002, 0.052);
      lit(0.004, 0.0025, 0.004, C.led, -0.07, top + 0.00125, 0.036);
      return wire();
    }
    if (kind === "proto") {
      // Block's Proto Rig, as its specifications lay it out: one chassis, the nine hashboards slid in side by side at
      // the front, each with its pull tab, light and vents; over them the three fanless power supplies and the control
      // board; six fans behind grilles at the back with the power inlets over them and their cords; carry handles
      // and PROTO on the sides.
      const W = mm(390), Hh = mm(290), D = mm(500), lip = 0.02, zf = -D / 2, inner = W / 2 - 0.016, mid = Hh - 0.016 - 0.1 - 0.006;
      B(W, Hh, D - lip, "#1c1d21", 0, Hh / 2, lip / 2);
      for (const sx of [-1, 1]) B(0.016, Hh, lip, "#2b2d32", sx * (W / 2 - 0.008), Hh / 2, zf + lip / 2);
      for (const [yy, h] of [[Hh - 0.008, 0.016], [0.008, 0.016], [mid, 0.012]]) B(2 * inner, h, lip, "#2b2d32", 0, yy, zf + lip / 2);
      const bw = (2 * inner - 8 * 0.004) / 9, by0 = 0.016, bh = mid - 0.006 - by0, byc = by0 + bh / 2, front = zf + 0.004;
      for (let i = 0; i < 9; i++) {
        const x = inner - bw / 2 - i * (bw + 0.004), F = T.face("-z", x, 0, front);
        B(bw, bh, lip - 0.004, "#2f3237", x, byc, zf + 0.004 + (lip - 0.004) / 2);
        F.B(0.034, 0.014, 0.006, "#d9dde2", 0, byc + bh / 2 - 0.03, -0.003);
        F.lit(0.008, 0.008, LIFT, i === 4 ? C.amber : C.led, 0, byc + bh / 2 - 0.06, -LIFT / 2, 0.9);
        for (let j = 0; j < 5; j++) F.B(0.04, 0.006, LIFT, "#0e0f11", 0, byc - 0.12 + j * 0.03, -LIFT / 2);
      }
      const py = mid + 0.006 + 0.05, cw = 0.09, pw = (2 * inner - cw - 3 * 0.004) / 3;
      for (let i = 0; i < 3; i++) {
        const x = inner - pw / 2 - i * (pw + 0.004), F = T.face("-z", x, py, front);
        B(pw, 0.1, lip - 0.004, "#26282c", x, py, zf + 0.004 + (lip - 0.004) / 2);
        for (let j = 0; j < 6; j++) F.B(pw * 0.62, 0.005, LIFT, "#0e0f11", -pw * 0.1, -0.03 + j * 0.012, -LIFT / 2);
        F.lit(0.006, 0.006, LIFT, C.led, pw * 0.36, 0.025, -LIFT / 2, 0.9);
        F.B(0.012, 0.05, 0.008, "#9aa0a8", pw * 0.36, -0.012, -0.004);
      }
      const cx = -inner + cw / 2;
      B(cw, 0.1, lip - 0.004, "#26282c", cx, py, zf + 0.004 + (lip - 0.004) / 2);
      ports(T.face("-z", cx, py, front), cw - 0.012, 0.09);
      const [qx, qy] = ports.at, side = -(W / 2 + 0.07);
      lead("lan", [[cx + qx, py + qy, front - 0.0125], [cx + qx, py + qy, front - 0.07], [side, py, front - 0.07], [side, 0.006, front + 0.03], [side, 0.006, 0.5]], 0.007, "#2b6fd8", "rj45");
      for (const sx of [-1, 1]) {
        const F = T.face(sx < 0 ? "-x" : "+x", sx * W / 2, 0, 0);
        for (const lx of [-0.12, 0.12]) F.B(0.03, 0.014, 0.03, "#9aa0a8", lx, Hh * 0.75, -0.015);
        F.B(0.27, 0.016, 0.014, "#9aa0a8", 0, Hh * 0.75, -0.037);
      }
      T.face("-x", -W / 2, Hh * 0.45, 0).say("PROTO", 0.009, "#f2f2f2", 0, 0, -0.0015, 0.6);
      for (const x of [-0.17, 0, 0.17]) for (const yy of [0.1, 0.26]) grille(T.face("+z", x, yy, D / 2), 0.15);
      for (const x of [-0.17, 0, 0.17]) {
        T.face("+z", x, py, D / 2).B(0.05, 0.035, 0.006, "#0b0b0d", 0, 0, -0.003);
        lead("mains", [[x, py, D / 2 + 0.006], [x, py, D / 2 + 0.07], [x, 0.012, D / 2 + 0.12]], 0.014, "#151517", "c19");
      }
      return wire();
    }
    // An Antminer: its shell between end plates a little proud of it all round, its fans set back in them under their
    // guards, screws down its sides, its
    // power supply on top (or beside it, the S9's, with its cables), the control board's ports at the front and its
    // label on the side; the hydro-cooled one has a closed front with its couplings, hoses, handles and power terminal.
    const A = ANTMINER[kind], len = mm(A.len), wid = mm(A.wid), hei = mm(A.hei), top = A.psu === "top" ? mm(52) : 0, body = hei - top, et = 0.04;
    // Its network port, where the control board puts it, and the mains cord's connector by the plug it needs.
    let net = null;
    const plugAt = POWER[kind] === "6-20" ? "c19" : POWER[kind] === "c20" ? "p13" : "c13";
    const f = A.fans ? Math.min(wid * 0.9, body / A.fans * 0.94, A.fan ? mm(A.fan) : Infinity) : 0, holes = [];
    for (let n = 0; n < A.fans; n++) holes.push(body * (n + 0.5) / A.fans);
    B(wid, body, len - 2 * et, A.color, 0, body / 2, 0);
    // Each end a plate a little proud of the shell all round: round the fans, set back in it under their guards, or
    // closed on the hydro-cooled one.
    for (const dz of [-1, 1]) {
      if (A.fans) bay(dz < 0 ? "-z" : "+z", 0, 0, dz * len / 2, wid + 2 * LIFT, body + LIFT, holes, f, A.frame, et);
      else B(wid + 2 * LIFT, body + LIFT, et, A.frame, 0, (body + LIFT) / 2, dz * (len / 2 - et / 2));
    }
    for (const sx of [-1, 1]) {
      const F = T.face(sx < 0 ? "-x" : "+x", sx * wid / 2, 0, 0);
      for (const yy of [body * 0.1, body * 0.9]) for (let i = 0; i < 4; i++) screw(F, -len * 0.33 + i * len * 0.22, yy);
    }
    const lw = Math.min(len * 0.5, 0.3, (0.4 * body - 0.01) / 0.23);
    label(T.face("-x", -wid / 2, body * 0.5, len * 0.04), lw, A.text, A.maker, A.brand);
    if (A.fans) {
      const room = (wid - f) / 2;
      const at = room >= 0.045 ? [-(wid + f) / 4, body * 0.78] : [-wid / 2 + 0.07, (body / 2 + f / 2 + body) / 2];
      if (room >= 0.045) ports(T.face("-z", at[0], at[1], -len / 2), room - 0.016, 0.09);
      else ports(T.face("-z", at[0], at[1], -len / 2), 0.11, Math.min(0.024, body / 2 - f / 2 - 0.004));
      net = [at[0] + ports.at[0], at[1] + ports.at[1], -len / 2 - 0.0125];
    } else {
      const F = T.face("-z", 0, 0, -len / 2);
      F.B(wid * 0.92, body * 0.9, 0.006, "#24272c", 0, body / 2, -0.003);
      for (const [x, color] of [[wid * 0.18, "#2b6fd8"], [-wid * 0.18, "#d8402b"]]) {
        const hy = body * 0.3, out = 0.6 - len / 2;
        F.Y(0.018, 0.018, 0.04, "#b8bec6", x, hy, -0.026, { rx: HALF, seg: 12 });
        F.Y(0.023, 0.023, 0.012, color, x, hy, -0.03, { rx: HALF, seg: 12 });
        F.Y(0.02, 0.02, 0.06, "#141414", x, hy, -0.075, { rx: HALF, seg: 12 });
        F.Y(0.02, 0.02, hy - 0.02, "#141414", x, (hy + 0.02) / 2, -0.105, { seg: 12 });
        F.Y(0.02, 0.02, out - 0.105, "#141414", x, 0.02, -(out + 0.105) / 2, { rx: HALF, seg: 12 });
      }
      for (const sx of [-1, 1]) {
        const hx = sx * (wid / 2 - 0.02);
        for (const yy of [body * 0.2, body * 0.8]) F.B(0.014, 0.014, 0.03, "#9aa0a8", hx, yy, -0.021);
        F.B(0.014, body * 0.6 + 0.014, 0.014, "#9aa0a8", hx, body / 2, -0.043);
      }
      F.B(0.06, 0.04, 0.02, "#111113", 0, body * 0.7, -0.016);
      for (let i = 0; i < 3; i++) F.Y(0.0045, 0.0045, 0.003, "#c9ccd2", -0.02 + i * 0.02, body * 0.7, -0.0275, { rx: HALF, seg: 8 });
      ports(T.face("-z", -0.05, body * 0.85, -len / 2 - 0.006), 0.1, 0.03);
      net = [-0.05 + ports.at[0], body * 0.85 + ports.at[1], -len / 2 - 0.0185];
      // Its three-phase cable through a gland in the power terminal, round to the +x side and back.
      Y(0.016, 0.016, 0.03, "#9aa0a8", 0, body * 0.7, -len / 2 - 0.0445, { rx: HALF, seg: 12 });
      lead("mains", [[0, body * 0.7, -len / 2 - 0.058], [0, body * 0.7, -len / 2 - 0.12], [wid / 2 + 0.06, body * 0.7 - 0.02, -len / 2 - 0.12], [wid / 2 + 0.06, 0.013, -len / 2 + 0.02], [wid / 2 + 0.06, 0.013, 0.5]], 0.022, "#151517");
    }
    if (A.psu === "top") {
      const pl = len - 2 * et - 0.004, pw = wid - 0.012;
      B(pw, top, pl, "#2a2d32", 0, body + top / 2, 0);
      const Pt = T.face("+y", 0, body + top, 0);
      for (let i = 0; i < 9; i++) Pt.B(pw * 0.6, 0.006, LIFT, "#16181b", 0, -pl * 0.4 + i * 0.016, -LIFT / 2);
      const Ps = T.face("-x", -pw / 2, body + top / 2, pl * 0.2);
      Ps.B(0.08, top * 0.6, LIFT, C.label, 0, 0, -LIFT / 2);
      Ps.say(A.psuName, Math.min(0.0024, 0.072 / (A.psuName.length * 6)), C.ink, 0, 0, -0.0035, 0.1);
      const In = T.face("-z", pw * 0.25, body + top / 2, -pl / 2);
      In.B(0.04, top * 0.6, 0.006, "#0b0b0d", 0, 0, -0.003);
      for (let i = 0; i < 3; i++) In.B(0.004, 0.008, LIFT, "#c9ccd2", -0.01 + i * 0.01, 0, -0.007);
      const ix = pw * 0.25, iy = body + top / 2, iz = -pl / 2 - 0.0085;
      lead("mains", [[ix, iy, iz], [ix, iy, iz - 0.08], [wid / 2 + 0.05, iy, iz - 0.08], [wid / 2 + 0.05, 0.009, -len / 2 + 0.04], [wid / 2 + 0.05, 0.009, 0.5]], 0.012, "#151517", plugAt);
      grille(T.face("+z", pw * 0.2, body + top / 2, pl / 2), top * 0.86);
    }
    if (A.psu === "none") {
      T.face("+z", 0.04, body - 0.017, len / 2).B(0.04, 0.026, 0.006, "#0b0b0d", 0, 0, -0.003);
      lead("mains", [[0.04, body - 0.017, len / 2 + 0.006], [0.04, body - 0.017, len / 2 + 0.07], [0.04, 0.009, len / 2 + 0.13], [0.04, 0.009, 0.5]], 0.012, "#151517", plugAt);
    }
    if (net) {
      const sx = -(wid / 2 + 0.045);
      lead("lan", [net, [net[0], net[1], net[2] - 0.06], [sx, net[1] - 0.02, net[2] - 0.06], [sx, 0.006, net[2] + 0.05], [sx, 0.006, 0.5]], 0.007, "#2b6fd8", "rj45");
    }
    if (A.psu === "side" || A.psu === "atx") {
      const atx = A.psu === "atx", pl = mm(atx ? 160 : 260), pw = mm(150), ph = mm(86), px = wid / 2 + 0.06 + pw / 2, pz = 0.02;
      B(pw, ph, pl, "#2a2d32", px, ph / 2, pz);
      grille(T.face("-z", px, ph / 2, pz - pl / 2), ph * 0.86);
      const Pt = T.face("+y", px, ph, pz);
      for (let i = 0; i < 6; i++) Pt.B(pw * 0.6, 0.006, LIFT, "#16181b", 0, -pl * 0.4 + i * 0.016, -LIFT / 2);
      Pt.B(0.1, 0.06, LIFT, C.label, 0, pl * 0.15, -LIFT / 2);
      Pt.say(atx ? "ATX" : "APW3", 0.004, C.ink, 0, pl * 0.15, -0.0035, 0.1);
      T.face("+z", px, ph / 2, pz + pl / 2).B(0.04, 0.03, 0.006, "#0b0b0d", 0, 0, -0.003);
      lead("mains", [[px, ph / 2, pz + pl / 2 + 0.006], [px, ph / 2, pz + pl / 2 + 0.07], [px, 0.009, pz + pl / 2 + 0.13], [px, 0.009, 0.5]], 0.012, "#151517", plugAt);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const yy = ph * (0.35 + r * 0.35), z = -0.02 + c * 0.06;
        T.cable([[px - pw / 2, yy, z], [wid / 2 + 0.012, yy, z]], 0.01, "#121214");
        B(0.012, 0.022, 0.03, "#0b0b0d", wid / 2 + 0.006, yy, z);
      }
    }
    return wire();
  };
  // The plinth every exhibit stands on: dark concrete with an amber band under its top.
  const plinth = own(() => merge(
    box({ w: 1.2, h: TOP, d: 1.2, color: CONCRETE, offset: { y: TOP / 2 } }),
    box({ w: 1.24, h: 0.04, d: 1.24, color: C.amber, emissive: 1, offset: { y: TOP - 0.04 } })
  ));
  // Each exhibit's model alone, at the museum's size, for the viewer.
  const viewModel = own(() => MINERS.map((ex) => RM.solo((k) => model(k, ex.model, 1, 0))));

  // ---------- pictures ----------
  // A plaque, `k` times its 560 by 440 size: year and title, name, the line, and three stats.
  const PLAQUE = { w: 560, h: 440 };
  const paintPlaque = (ctx, ex, k = 1) => {
    const W = PLAQUE.w * k, H = PLAQUE.h * k;
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.amber; ctx.lineWidth = 6 * k; ctx.strokeRect(6 * k, 6 * k, W - 12 * k, H - 12 * k);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    P.pix(ctx, `${Math.floor(ex.year)} · ${ex.title}`, 28 * k, 48 * k, 30 * k, C.amberText, "left");
    ctx.fillStyle = C.white; P.fit(ctx, ex.name, 500 * k, 700, 36 * k); ctx.fillText(ex.name, 28 * k, 112 * k);
    ctx.fillStyle = "#d4c8b6"; ctx.font = P.font(400, 23 * k);
    let line = "", y = 152 * k;
    for (const word of ex.text.split(" ")) {
      const t = line ? line + " " + word : word;
      if (ctx.measureText(t).width > 500 * k) { ctx.fillText(line, 28 * k, y); y += 30 * k; line = word; } else line = t;
    }
    ctx.fillText(line, 28 * k, y);
    // Efficiency on a log scale from 10^7.5 joules a terahash (left) to 10^0.5 (right): every machine a tick, this one
    // lit, so walking the ring the dot runs from one end to the other.
    if (ex.jth) {
      const x0 = 28 * k, w = 504 * k, at = (j) => x0 + (7.5 - Math.log10(j)) / 7 * w;
      P.pix(ctx, "JOULES A TERAHASH · LOG SCALE", x0, 250 * k, 12 * k, "#8c7f6c", "left");
      ctx.fillStyle = "#2b2520"; P.roundRect(ctx, x0, 264 * k, w, 12 * k, 6 * k); ctx.fill();
      ctx.fillStyle = "rgba(247,147,26,.45)"; P.roundRect(ctx, x0, 264 * k, at(ex.jth) - x0, 12 * k, 6 * k); ctx.fill();
      for (const other of MINERS) if (other.jth && other !== ex) { ctx.fillStyle = "#6e6457"; ctx.fillRect(at(other.jth) - 1.5 * k, 261 * k, 3 * k, 18 * k); }
      ctx.fillStyle = C.amberText; ctx.beginPath(); ctx.arc(at(ex.jth), 270 * k, 10 * k, 0, P.TAU); ctx.fill();
      ctx.fillStyle = "#8c7f6c"; ctx.font = P.font(500, 15 * k, P.MONO); ctx.textAlign = "center";
      for (const [j, label] of [[1e7, "10,000,000"], [1e5, "100,000"], [1e3, "1,000"], [10, "10"]]) ctx.fillText(label, at(j), 302 * k);
      ctx.textAlign = "left";
    }
    // A plaque with no figures to give says its piece in a paragraph instead.
    if (ex.paragraph) {
      ctx.fillStyle = "#d4c8b6"; ctx.font = P.font(400, 21 * k);
      let words = "", py = 262 * k;
      for (const word of ex.paragraph.split(" ")) {
        const t = words ? words + " " + word : word;
        if (ctx.measureText(t).width > 500 * k) { ctx.fillText(words, 28 * k, py); py += 28 * k; words = word; } else words = t;
      }
      ctx.fillText(words, 28 * k, py);
    }
    ex.stats.forEach(([key, value], i) => {
      const x = (28 + i * 172) * k;
      ctx.fillStyle = "#d98a2b"; ctx.font = P.font(500, 19 * k); ctx.fillText(key, x, 360 * k);
      ctx.fillStyle = C.white; P.fit(ctx, value, 160 * k, 600, 26 * k, P.MONO); ctx.fillText(value, x, 398 * k);
    });
  };
  const plaques = own(() => MINERS.map((ex) => {
    const canvas = CH.canvas(PLAQUE.w, PLAQUE.h);
    paintPlaque(canvas.getContext("2d"), ex);
    return RM.flatPicture(canvas, 0.94, 0.74);
  }));
  // The sign on the middle plinth's front.
  const paintSign = (ctx, w, h) => {
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.amber; ctx.lineWidth = h * 0.04; ctx.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = C.white;
    for (const [text, y] of [["One S21 (200 TH/s) outhashes the whole", 0.27], ["2012 network (~16 TH/s) about 13 times over", 0.5]]) { P.fit(ctx, text, w * 0.9, 600, h * 0.14); ctx.fillText(text, w / 2, h * y); }
    P.pix(ctx, "MODELS 1.6X LIFE SIZE · STATS APPROXIMATE", w / 2, h * 0.76, h * 0.075, C.amberText);
  };
  // The sign wrapped round the middle plinth's tapering side toward the doors, 4 mm proud of it: a band `SIGN.arc`
  // radians round and `SIGN.h` tall about `SIGN.y`, built in the frame of a node standing `SIGN.R` out toward the doors
  // and turned to face the middle, so the picture's curve (the renderer's `curve`, mapped by angle round a centre `R`
  // behind it) is the plinth's own and its letters keep their shape all the way round. That frame mirrors the
  // picture, so it is painted mirrored.
  const SIGN = { y: 0.55, h: 0.5, arc: 1.28, R: 1.3 - 0.55 * 0.1 / TOP, n: 24 };
  const signBand = own(() => {
    const canvas = CH.canvas(1000, 310), ctx = canvas.getContext("2d");
    ctx.translate(1000, 0); ctx.scale(-1, 1);
    paintSign(ctx, 1000, 310);
    const { face, blank } = RM.helpers, geo = blank(), r = (y) => 1.3 - y * 0.1 / TOP + 0.004;
    const at = (a, y) => [-r(y) * Math.sin(a), y, SIGN.R - r(y) * Math.cos(a)];
    const y0 = SIGN.y - SIGN.h / 2, y1 = SIGN.y + SIGN.h / 2;
    for (let i = 0; i < SIGN.n; i++) {
      const a0 = -SIGN.arc / 2 + SIGN.arc * i / SIGN.n, a1 = a0 + SIGN.arc / SIGN.n, am = (a0 + a1) / 2;
      face(geo, [at(a0, y0), at(a1, y0), at(a1, y1), at(a0, y1)], [255, 255, 255], 0.9, [-Math.sin(am), 0, -Math.cos(am)]);
    }
    geo.castShadow = false;
    geo.imageSurface = { canvas, version: 1, rect: [-SIGN.arc / 2 * SIGN.R, y0, SIGN.arc * SIGN.R, SIGN.h], curve: [SIGN.R, 0, 0], tessellated: true };
    return geo;
  });
  // The crown: today's rate in full, live from mempool.space's reading when there is one, else the baked figure. Its
  // picture is laid out on 1024 units and painted at CROWN pixels, small enough that Canvas 2D's shaded-picture cache
  // keeps it whole beside the plaques.
  const CROWN = 768;
  const spelled = (rate) => {
    const e = Math.floor(Math.log10(rate)), lead = String(Math.round(rate / 10 ** (e - 2)));
    return (lead + "0".repeat(Math.max(0, e - 2))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  const paintCrown = (ctx, reader, now) => {
    const N = CROWN, u = N / 1024, cx = N / 2, v = reader.value("hashrate"), rate = v && v.current > 0 ? v.current : BAKED.rate;
    ctx.fillStyle = "#0a0b0f"; ctx.fillRect(0, 0, N, N);
    ctx.strokeStyle = C.amber; ctx.lineWidth = 8 * u; ctx.beginPath(); ctx.arc(cx, cx, 480 * u, 0, P.TAU); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    P.pix(ctx, "THE NETWORK TODAY", cx, 320 * u, 40 * u, C.amberText);
    ctx.fillStyle = C.white; ctx.font = P.font(600, 130 * u, P.MONO);
    ctx.fillText(rate >= 1e21 ? `${(rate / 1e21).toFixed(2)} ZH/s` : `${Math.round(rate / 1e18)} EH/s`, cx, 470 * u);
    ctx.fillStyle = C.amberText; ctx.font = P.font(600, 34 * u, P.MONO);
    ctx.fillText(spelled(rate), cx, 560 * u);
    ctx.fillText(`hashes a second ≈ 2^${Math.round(Math.log2(rate))}`, cx, 610 * u);
    ctx.fillStyle = v ? "#4fd08a" : C.grey; ctx.font = P.font(600, 30 * u, P.MONO);
    ctx.fillText(v ? CH.freshness(reader.status("hashrate"), reader.at("hashrate"), now) : `${BAKED.when} · ${reader.status("hashrate")}`, cx, 690 * u);
  };

  // ---------- its door ----------
  // The room's dress, one palette throughout: charcoal steel and concrete, and Bitcoin orange lit, so it glows yellow;
  // the floor's markings are painted in that glow's colour (C.glow) to match.
  const STEEL = "#34373d", STEEL_DARK = "#26282d", CONCRETE = "#4a4c51";
  // The door: dark steel leaves, each in a raised frame studded with rivets, with a small window, a push bar, an
  // amber strip down the edge where they meet and a hazard-striped kick plate.
  const door = {
    casing: "#2a2c31", frame: STEEL, header: STEEL_DARK, word: C.amber, strip: C.amber, chain: false,
    leaf: "#30333a", seam: "#121316", plate: STEEL_DARK, face: C.amber, mark: STEEL_DARK,
    leafFace(side, H) {
      const h = H.W / 2, top = H.D - 0.14, rim = "#40444b", rivet = "#7a8089";
      for (const [x0, y0, x1, y1] of [[-h + 0.08, top - 0.06, h - 0.08, top], [-h + 0.08, 0.36, h - 0.08, 0.42], [-h + 0.08, 0.42, -h + 0.14, top - 0.06], [h - 0.14, 0.42, h - 0.08, top - 0.06]]) H.rect(x0, y0, x1, y1, rim, 0, 1);
      for (let x = -h + 0.2; x < h - 0.15; x += 0.25) for (const y of [0.39, top - 0.03]) H.disc(x, y, 0.012, rivet, 0, 6, 2);
      for (let y = 0.7; y < top - 0.2; y += 0.35) for (const x of [-h + 0.11, h - 0.11]) H.disc(x, y, 0.012, rivet, 0, 6, 2);
      H.rect(H.inner, 0.05, H.inner - Math.sign(H.inner) * 0.03, H.D - 0.05, C.amber, 0.7, 1);
      H.rect(-0.22, 1.75, 0.22, 2.45, "#0d1014", 0.3, 1);
      for (const [x0, y0, x1, y1] of [[-0.24, 2.45, 0.24, 2.47], [-0.24, 1.73, 0.24, 1.75], [-0.24, 1.75, -0.22, 2.45], [0.22, 1.75, 0.24, 2.45]]) H.rect(x0, y0, x1, y1, C.amber, 0.5, 2);
      for (const x of [-h + 0.13, h - 0.13]) H.rect(x - 0.03, 0.98, x + 0.03, 1.12, STEEL_DARK, 0, 2);
      H.rect(-h + 0.11, 1.02, h - 0.11, 1.08, "#a7adb5", 0.1, 3);
      H.rect(-h + 0.06, 0.06, h - 0.06, 0.3, "#141414", 0, 1);
      for (let x = -h + 0.1; x + 0.24 < h - 0.06; x += 0.13) H.line(x, 0.08, x + 0.2, 0.28, 0.05, C.amber, 0.3, 2);
    }
  };
  // Steel pilasters either side of the doors, each with an amber strip, and a steel lintel over them.
  const doorTrim = (K, L) => {
    const d = RM.doorway(L), z = d.Z - 0.14, x = d.W + d.F + 0.14;
    for (const sx of [-1, 1]) {
      K.box(0.22, d.head - 0.3, 0.16, STEEL, sx * x, (d.head - 0.3) / 2 + 0.15, z);
      K.box(0.04, d.head - 0.5, 0.004, C.amber, sx * x, (d.head - 0.3) / 2 + 0.15, z - 0.082, { emissive: 0.85, glow: true });
      K.box(0.3, 0.15, 0.2, STEEL_DARK, sx * x, 0.075, z);
      K.box(0.3, 0.15, 0.2, STEEL_DARK, sx * x, d.head - 0.075, z);
    }
    K.box(2 * x + 0.5, 0.14, 0.3, STEEL, 0, d.head + 0.07, d.Z - 0.15);
    K.box(2 * x + 0.4, 0.03, 0.004, C.amber, 0, d.head + 0.07, d.Z - 0.302, { emissive: 0.85, glow: true });
  };

  const plan = (K, L) => {
    doorTrim(K, L);
    const e0 = ROOMS.edgeEl(L, 0) / P.DEG, lo = e0 + 6, hi = e0 + 42, elOf = (lg) => lo + (lg - 6) / 16 * (hi - lo);
    K.wallColor("#1c1d22");
    K.render({ sky: [0.52, 0.5, 0.48], ground: [0.22, 0.2, 0.18], ambientFloor: 0.42, bloomStrength: 0.55 });
    // The dome: the hashrate chart round the room, eras shaded, units over the door, years along its foot.
    K.dome((ctx, D) => {
      D.sky(ctx, [[90, "#0a0b0f"], [0, "#0e0f13"]]);
      const X = (yr) => D.x(azOf(yr)), base = D.y(lo);
      for (const [, a, b, color] of ERAS) { ctx.fillStyle = color; ctx.fillRect(X(a), D.y(hi + 4), X(b) - X(a), base - D.y(hi + 4)); }
      for (const [name, a, b] of ERAS) D.pixText(ctx, name, azOf((a + b) / 2), hi + 2, 0.8, "rgba(255,230,190,.9)");
      for (const [lg, unit] of UNITS) {
        ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.fillRect(0, D.y(elOf(lg)) - 1, D.W, 2);
        for (const az of [180, -40, 60]) D.text(ctx, unit, az, elOf(lg) + 1.2, 0.69, "rgba(200,200,210,.75)", 600, D.MONO);
      }
      // The history from the chart's start to its end, filled down to its foot and traced in amber.
      const points = [[START, HISTORY[0][1]], ...HISTORY, [END, HISTORY[HISTORY.length - 1][1]]];
      const trace = () => { ctx.beginPath(); points.forEach(([yr, lg], i) => { const x = X(yr), y = D.y(elOf(lg)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); };
      trace(); ctx.lineTo(X(END), base); ctx.lineTo(X(START), base); ctx.closePath(); ctx.fillStyle = "rgba(247,147,26,.08)"; ctx.fill();
      trace(); ctx.strokeStyle = C.amber; ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.stroke();
      // Every year a tick across the chart's foot, above and below it, and its year under it: right over that year's
      // tick on the floor.
      ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(X(START), base - 1, X(2026) - X(START), 2);
      for (let yr = START; yr <= 2026; yr++) {
        ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fillRect(X(yr) - 1.5, base - 12, 3, 24);
        D.text(ctx, String(yr), azOf(yr), lo - 2.2, 0.74, C.grey, 600, D.MONO);
      }
      D.text(ctx, "about 5 MH/s", azOf(START) + 1, elOf(6.74) + 4.5, 0.92, C.white, 700, D.FONT, "left");
      D.text(ctx, "about 1 ZH/s · 2026", azOf(END) - 1, elOf(21.01) + 3.5, 1, C.amberText, 700, D.FONT, "right");
      D.text(ctx, "NETWORK HASHRATE · LOG SCALE · 14 ORDERS OF MAGNITUDE", 0, hi + 9, 0.85, C.white, 700);
      D.text(ctx, "five-week averages of mempool.space's daily estimates · approximate", 0, hi + 6.6, 0.45, C.grey, 500);
    });
    // The crown stands well inside the dome, so Canvas 2D's face sort keeps it in front of the dome's own faces.
    K.live({ cap: true, el0: hi + 13, inset: 0.97, w: CROWN, h: CROWN, tip: "The network's hashrate today",
      key: (f) => { const v = f.reader.value("hashrate"); return `${f.reader.status("hashrate")}|${v ? v.current : ""}|${f.reader.at("hashrate")}`; },
      paint: (ctx, f, now) => paintCrown(ctx, f.reader, now) });
    // The exhibits' ring: plinths `rx` out, and the ring on the floor `ringR` out with a tick for every year.
    const rx = L.r0 - 3.4, ringR = rx - 1.9;
    K.floor((ctx, F) => {
      // Polished concrete in slabs 2.4 m square, each its own shade, flecked with aggregate, a thin seam between them.
      const rnd = P.rng(2140), slab = 2.4, first = -slab * Math.ceil(F.rf / slab);
      ctx.fillStyle = "#2b2c30"; ctx.fillRect(0, 0, F.N, F.N);
      for (let x = first; x < F.rf; x += slab) for (let z = first; z < F.rf; z += slab) {
        ctx.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "0,0,0"},${(0.015 + rnd() * 0.03).toFixed(3)})`;
        ctx.fillRect(F.X(x), F.Y(z), slab * F.s, slab * F.s);
      }
      for (let i = 0; i < 6000; i++) {
        const v = rnd() < 0.5 ? 255 : 0;
        ctx.fillStyle = `rgba(${v},${v},${v},${(0.04 + rnd() * 0.06).toFixed(3)})`;
        ctx.fillRect(rnd() * F.N, rnd() * F.N, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      ctx.strokeStyle = "#1d1e21"; ctx.lineWidth = 2;
      for (let v = first; v < F.rf; v += slab) {
        ctx.beginPath(); ctx.moveTo(F.X(v), 0); ctx.lineTo(F.X(v), F.N); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, F.Y(v)); ctx.lineTo(F.N, F.Y(v)); ctx.stroke();
      }
      ctx.strokeStyle = C.glow; ctx.lineWidth = 0.08 * F.s; ctx.beginPath(); ctx.arc(F.X(0), F.Y(0), ringR * F.s, 0, P.TAU); ctx.stroke();
      F.path(0, L.doorZ, 0, ringR + 0.1, 0.7, C.glow);
      // Every year a tick across the ring and its year inside it, reading from inside, right under that year's tick on the
      // dome.
      const on = (deg, r) => { const a = deg * P.DEG; return [F.X(Math.sin(a) * r), F.Y(-Math.cos(a) * r)]; };
      ctx.strokeStyle = C.glow; ctx.lineWidth = 0.06 * F.s;
      for (let yr = START; yr <= 2026; yr++) {
        const [x0, y0] = on(azOf(yr), ringR - 0.32), [x1, y1] = on(azOf(yr), ringR + 0.32), [x, y] = on(azOf(yr), ringR - 0.78);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.save(); ctx.translate(x, y); ctx.rotate(azOf(yr) * P.DEG);
        P.pix(ctx, String(yr), 0, 0, 0.3 * F.s, C.glowText);
        ctx.restore();
      }
    });
    // The exhibits: plinth, model, and the plaque on the plinth's face toward the middle, under its amber band.
    const cards = plaques();
    MINERS.forEach((ex, i) => {
      const a = AZ[i] * P.DEG, x = rx * Math.sin(a), z = -rx * Math.cos(a), g = K.group(x, 0, z, headingTo(x, z, 0, 0));
      const target = { kind: "exhibit", tip: `${Math.floor(ex.year)} · ${ex.name} · tap to see it up close`, radius: 0.95, index: i };
      g.node(null, plinth(), 0, 0, 0, { target });
      model(g, ex.model, 1, TOP + 0.005, true);
      g.node(null, cards[i], 0, 0.45, -0.604, { ry: Math.PI, glow: true, target });
      g.solid({ x: 0, z: 0, hx: 0.66, hz: 0.66 });
    });
    // The middle: a round plinth with an amber ring, its sign wrapped round it toward the doors, and a big S21 turning
    // on it.
    K.cyl(1.2, 1.3, TOP, CONCRETE, 0, TOP / 2, 0, { seg: 48 });
    K.torus(1.2, 0.03, C.amber, 0, TOP, 0, { emissive: 1, glow: true, seg: 64 });
    K.node(null, signBand(), 0, 0, SIGN.R, { ry: Math.PI, glow: true, target: { kind: "sign", tip: "One S21 against the 2012 network", radius: 0.9, data: { say: "One S21 (200 TH/s) outhashes the whole 2012 network (~16 TH/s) about 13 times over" } } });
    K.node("turntable", (k) => model(k, "s21", BIG, 0, "bare"), 0, TOP + 0.005, 0, { target: { kind: "exhibit", tip: "Antminer S21 · tap to see it up close", radius: 1.2, index: S21 } });
    K.solid({ x: 0, z: 0, r: 1.38 });
    // Point lights: the turntable's spot, the exhibits round the ring, the dome's wash.
    K.light(0, 5.5, 0, 14, 1, 0.94, 0.86);
    for (const az of [-150, -102, -30, 36, 108, 146]) K.light(9.2 * Math.sin(az * P.DEG), 3.8, -9.2 * Math.cos(az * P.DEG), 8, 0.78, 0.7, 0.6);
    K.light(0, 9, -5, 22, 0.5, 0.46, 0.42);
  };

  // What moves: the big S21 turning. A tap on an exhibit, or Space in front of one, opens it in the model viewer: the
  // machine up close in 3D beside all its stats, paged in date order.
  const animate = (nodes, built) => {
    const turntable = nodes.turntable, rx = built.layout.r0 - 3.4;
    const spots = MINERS.map((ex, i) => ({ x: rx * Math.sin(AZ[i] * P.DEG), z: -rx * Math.cos(AZ[i] * P.DEG) }));
    const look = (i) => BL.modelViewer.open({
      title: "Mining Museum", count: MINERS.length, index: i,
      help: matchMedia("(pointer: coarse)").matches ? "Drag to turn it · pinch to zoom · the arrows for the next machine" : "Drag to turn it · scroll to zoom · ← → for the next machine",
      item: (n) => {
        const ex = MINERS[n];
        return { kicker: `${Math.floor(ex.year)} · ${ex.title}`, name: ex.name, text: ex.about, stats: ex.specs, note: ex.note, links: ex.sources, geometry: viewModel()[n] };
      }
    });
    // Space's action: the nearest exhibit within reach and in front of the Ooga, or the turning S21 in the middle.
    const acts = MINERS.map((ex, i) => ({ key: `look${i}`, label: "LOOK", hint: `Space · Look at the ${ex.name} up close`, tap: "Tap LOOK to see it up close", run: () => look(i) }));
    const middle = { key: "look-middle", label: "LOOK", hint: "Space · Look at the Antminer S21 up close", tap: "Tap LOOK to see it up close", run: () => look(S21) };
    let act = null, best = 0;
    const consider = (a, ax, az, reach, x, z, fx, fz) => {
      const dx = ax - x, dz = az - z, d = Math.hypot(dx, dz), f = Math.hypot(fx, fz) || 1;
      if (d < reach && d < best && (dx * fx + dz * fz) / (d * f) > 0.2) { act = a; best = d; }
    };
    return {
      update(dt) { turntable.rotation.y += dt * 0.35; },
      near(x, z, fx, fz) {
        act = null; best = Infinity;
        for (let i = 0; i < spots.length; i++) consider(acts[i], spots[i].x, spots[i].z, 2.4, x, z, fx, fz);
        consider(middle, 0, 0, 2.8, x, z, fx, fz);
        return act;
      },
      tap(owner) {
        if (owner.kind !== "exhibit") return false;
        look(owner.index);
        return true;
      },
      // Leaving the room with an exhibit open (Back, a lost visit) closes the viewer, and with it the museum's models.
      dispose() { BL.modelViewer.close(); }
    };
  };
  BL.timechainRoomKinds.mining = { plan, animate, door };
})();
