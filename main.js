// main.js
// =========================
// Auto Transaksi Multi-Chain
// =========================

require("dotenv").config();
const readline = require("readline");
const { ethers } = require("ethers");
const chalk = require("chalk");
const ora = require("ora");
const boxen = require("boxen");

const banner = require("./config/banner");
const chains = require("./config/chains.json");
const addressList = require("./config/addresses.json");
const erc20Abi = require("./abis/erc20.json");
const tokenArtifact = require("./abis/MyToken.json");
const nftArtifact = require("./abis/MyNFT.json");

// === SETUP CLI ===
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

// === STATE AKTIF ===
let currentChain = null;
let provider = null;
let wallet = null;

// =========================
// MENU PILIH CHAIN
// =========================

async function selectChainMenu() {
  console.clear();
  console.log(chalk.cyan(banner));

  console.log(chalk.bold("\n=== PILIH CHAIN ===\n"));

  chains.forEach((c, idx) => {
    console.log(chalk.yellow(`${idx + 1}. ${c.label}`));
  });
  console.log(chalk.red(`${chains.length + 1}. Exit`));

  const choice = await ask(chalk.green("\nPilih chain: "));
  const idx = parseInt(choice, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx > chains.length) {
    console.log(chalk.red("Pilihan tidak valid."));
    return selectChainMenu();
  }

  if (idx === chains.length) {
    console.log(chalk.red("Keluar..."));
    rl.close();
    process.exit(0);
  }

  currentChain = chains[idx];

  const rpc = process.env[currentChain.rpcEnv];
  const pk = process.env[currentChain.pkEnv];

  if (!rpc || !pk) {
    console.log(
      chalk.red(
        `RPC atau Private Key untuk chain "${currentChain.label}" belum diset di .env`
      )
    );
    return selectChainMenu();
  }

  provider = new ethers.JsonRpcProvider(rpc);
  wallet = new ethers.Wallet(pk, provider);

  console.log(
    boxen(
      `${chalk.bold("CHAIN AKTIF :")} ${chalk.cyan(currentChain.label)}\n` +
        `${chalk.bold("Wallet     :")} ${wallet.address}`,
      { padding: 1, borderColor: "cyan", borderStyle: "round" }
    )
  );

  await mainMenu();
}

// =========================
// MENU UTAMA
// =========================

async function mainMenu() {
  console.log(chalk.bold("\n=== MENU UTAMA AUTO TRANSAKSI ==="));
  console.log(chalk.yellow("1.") + " Auto Send");
  console.log(chalk.yellow("2.") + " Deploy Contract");
  console.log(chalk.yellow("3.") + " Check Balance Token");
  console.log(chalk.yellow("4.") + " Ganti Chain");
  console.log(chalk.red("5.") + " Exit");

  const choice = await ask(chalk.green("\nPilih menu: "));

  switch (choice.trim()) {
    case "1":
      await autoSendMenu();
      break;
    case "2":
      await deployContractMenu();
      break;
    case "3":
      await checkBalanceToken();
      break;
    case "4":
      await selectChainMenu();
      return;
    case "5":
      console.log(chalk.red("Keluar..."));
      rl.close();
      process.exit(0);
    default:
      console.log(chalk.red("Pilihan tidak valid."));
  }

  return mainMenu();
}

// =========================
// MENU 1: AUTO SEND
// =========================

async function autoSendMenu() {
  console.log(chalk.bold("\n=== AUTO SEND ==="));
  console.log(chalk.yellow("a.") + " Send to random address");
  console.log(
    chalk.yellow("b.") +
      " Send ke address " +
      chalk.gray("(dari address.json, diacak)")
  );
  console.log(chalk.yellow("c.") + " Send ke address (manual)");
  console.log(chalk.red("d.") + " Exit (kembali ke menu utama)");

  const choice = (await ask(chalk.green("\nPilih submenu: ")))
    .trim()
    .toLowerCase();

  switch (choice) {
    case "a":
      await sendToRandomAddress();
      break;
    case "b":
      await sendToRandomFromList();
      break;
    case "c":
      await sendToManualAddress();
      break;
    case "d":
      return;
    default:
      console.log(chalk.red("Pilihan tidak valid."));
  }

  return autoSendMenu();
}

// a. random address (dummy)
async function sendToRandomAddress() {
  const amount = await ask(
    chalk.green("Nominal native coin yang mau dikirim (dalam ETH/coin): ")
  );

  const randomWallet = ethers.Wallet.createRandom();
  const to = randomWallet.address;
  console.log(chalk.blue("\nRandom address:"), to);

  await sendNative(to, amount);
}

// b. dari address.json (diacak)
async function sendToRandomFromList() {
  if (!addressList || addressList.length === 0) {
    console.log(chalk.red("config/addresses.json kosong atau tidak terbaca."));
    return;
  }

  const shuffled = [...addressList].sort(() => Math.random() - 0.5);
  console.log(chalk.bold("\nDaftar alamat (sudah diacak):"));
  shuffled.forEach((addr, idx) => {
    console.log(`${chalk.yellow(idx + 1 + ".")} ${addr}`);
  });

  const idxStr = await ask(chalk.green("\nPilih nomor alamat: "));
  const idx = parseInt(idxStr, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= shuffled.length) {
    console.log(chalk.red("Pilihan tidak valid."));
    return;
  }

  const to = shuffled[idx];
  const amount = await ask(
    chalk.green("Nominal native coin yang mau dikirim (dalam ETH/coin): ")
  );
  await sendNative(to, amount);
}

// c. manual address
async function sendToManualAddress() {
  const to = await ask(chalk.green("Masukkan address tujuan: "));
  const amount = await ask(
    chalk.green("Nominal native coin yang mau dikirim (dalam ETH/coin): ")
  );
  await sendNative(to.trim(), amount);
}

// Fungsi kirim native coin (dengan spinner & TX hash box)
async function sendNative(to, amountStr) {
  const spinner = ora(
    `Mengirim ${amountStr} coin ke ${to} di chain ${currentChain.label}...`
  ).start();

  try {
    const value = ethers.parseEther(amountStr);
    const tx = await wallet.sendTransaction({ to, value });

    spinner.text = "Menunggu konfirmasi transaksi...";
    const receipt = await tx.wait();
    spinner.succeed("Transaksi berhasil!");

    console.log(
      boxen(
        `${chalk.bold("TX HASH :")} ${chalk.green(tx.hash)}\n` +
          `${chalk.bold("BLOCK   :")} ${receipt.blockNumber}`,
        { padding: 1, borderColor: "green", borderStyle: "round" }
      )
    );
  } catch (err) {
    spinner.fail("Transaksi gagal!");
    console.error(chalk.red("Error:"), err.message);
  }
}

// =========================
// MENU 2: DEPLOY CONTRACT
// =========================

async function deployContractMenu() {
  console.log(chalk.bold("\n=== DEPLOY CONTRACT ==="));
  console.log(chalk.yellow("a.") + " Deploy Token");
  console.log(chalk.yellow("b.") + " Deploy NFT");
  console.log(chalk.red("c.") + " Exit (kembali ke menu utama)");

  const choice = (await ask(chalk.green("\nPilih submenu: ")))
    .trim()
    .toLowerCase();

  switch (choice) {
    case "a":
      await deployTokenMenu();
      break;
    case "b":
      await deployNftMenu();
      break;
    case "c":
      return;
    default:
      console.log(chalk.red("Pilihan tidak valid."));
  }

  return deployContractMenu();
}

// 2.a Deploy Token
async function deployTokenMenu() {
  console.log(chalk.bold("\n=== DEPLOY TOKEN ==="));
  console.log(chalk.yellow("1.") + " Nama manual");
  console.log(chalk.yellow("2.") + " Nama random");
  console.log(chalk.red("3.") + " Exit (kembali ke menu Deploy Contract)");

  const choice = (await ask(chalk.green("\nPilih: "))).trim();
  let name, symbol;

  switch (choice) {
    case "1":
      name = await ask(chalk.green("Masukkan nama token: "));
      symbol = await ask(chalk.green("Masukkan simbol token: "));
      break;
    case "2":
      name =
        "TOKEN_" +
        Math.random().toString(36).substring(2, 8).toUpperCase();
      symbol = "SYM" + Math.floor(Math.random() * 1000);
      console.log(
        chalk.blue(`\nNama random: ${name}, simbol: ${symbol}`)
      );
      break;
    case "3":
      return;
    default:
      console.log(chalk.red("Pilihan tidak valid."));
      return deployTokenMenu();
  }

  await deployTokenContract(name.trim(), symbol.trim());
}

// 2.b Deploy NFT
async function deployNftMenu() {
  console.log(chalk.bold("\n=== DEPLOY NFT ==="));
  console.log(chalk.yellow("1.") + " Nama manual");
  console.log(chalk.yellow("2.") + " Nama random");
  console.log(chalk.red("3.") + " Exit (kembali ke menu Deploy Contract)");

  const choice = (await ask(chalk.green("\nPilih: "))).trim();
  let name, symbol;

  switch (choice) {
    case "1":
      name = await ask(chalk.green("Masukkan nama koleksi NFT: "));
      symbol = await ask(chalk.green("Masukkan simbol NFT: "));
      break;
    case "2":
      name =
        "NFT_" +
        Math.random().toString(36).substring(2, 8).toUpperCase();
      symbol = "NFT" + Math.floor(Math.random() * 1000);
      console.log(
        chalk.blue(`\nNama random: ${name}, simbol: ${symbol}`)
      );
      break;
    case "3":
      return;
    default:
      console.log(chalk.red("Pilihan tidak valid."));
      return deployNftMenu();
  }

  await deployNftContract(name.trim(), symbol.trim());
}

// Deploy ERC20 (dengan spinner & TX box)
async function deployTokenContract(name, symbol) {
  const spinner = ora(
    `Deploy Token ${name} (${symbol}) di ${currentChain.label}...`
  ).start();

  try {
    const factory = new ethers.ContractFactory(
      tokenArtifact.abi,
      tokenArtifact.bytecode,
      wallet
    );

    const contract = await factory.deploy(name, symbol);
    const deployTx = contract.deploymentTransaction();

    spinner.text = "Menunggu konfirmasi deploy...";
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    spinner.succeed("Token berhasil di-deploy!");

    console.log(
      boxen(
        `${chalk.bold("CONTRACT :")} ${chalk.green(addr)}\n` +
          (deployTx
            ? `${chalk.bold("TX HASH  :")} ${chalk.green(
                deployTx.hash
              )}\n`
            : "") +
          `${chalk.bold("CHAIN    :")} ${currentChain.label}`,
        { padding: 1, borderColor: "green", borderStyle: "round" }
      )
    );
  } catch (err) {
    spinner.fail("Gagal deploy token!");
    console.error(chalk.red("Error:"), err.message);
  }
}

// Deploy ERC721 (dengan spinner & TX box)
async function deployNftContract(name, symbol) {
  const spinner = ora(
    `Deploy NFT ${name} (${symbol}) di ${currentChain.label}...`
  ).start();

  try {
    const factory = new ethers.ContractFactory(
      nftArtifact.abi,
      nftArtifact.bytecode,
      wallet
    );

    const contract = await factory.deploy(name, symbol);
    const deployTx = contract.deploymentTransaction();

    spinner.text = "Menunggu konfirmasi deploy...";
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    spinner.succeed("NFT berhasil di-deploy!");

    console.log(
      boxen(
        `${chalk.bold("CONTRACT :")} ${chalk.green(addr)}\n` +
          (deployTx
            ? `${chalk.bold("TX HASH  :")} ${chalk.green(
                deployTx.hash
              )}\n`
            : "") +
          `${chalk.bold("CHAIN    :")} ${currentChain.label}`,
        { padding: 1, borderColor: "green", borderStyle: "round" }
      )
    );
  } catch (err) {
    spinner.fail("Gagal deploy NFT!");
    console.error(chalk.red("Error:"), err.message);
  }
}

// =========================
// MENU 3: CHECK BALANCE TOKEN
// =========================

async function checkBalanceToken() {
  if (!currentChain.tokens || currentChain.tokens.length === 0) {
    console.log(
      chalk.red(
        "Tidak ada token yang dikonfigurasi untuk chain ini di config/chains.json"
      )
    );
    return;
  }

  console.log(
    boxen(
      `${chalk.bold("CHECK BALANCE TOKEN")}\n` +
        `${chalk.bold("Chain :")} ${chalk.cyan(
          currentChain.label
        )}\n` +
        `${chalk.bold("Wallet:")} ${wallet.address}`,
      { padding: 1, borderColor: "cyan", borderStyle: "round" }
    )
  );

  for (const t of currentChain.tokens) {
    const spinner = ora(
      `Cek saldo ${t.name || t.symbol} @ ${t.address}...`
    ).start();
    try {
      const token = new ethers.Contract(t.address, erc20Abi, provider);
      const [balanceRaw, decimals, symbol, name] = await Promise.all([
        token.balanceOf(wallet.address),
        token.decimals(),
        token.symbol(),
        token.name(),
      ]);

      const divisor = ethers.parseUnits("1", decimals);
      const balance = balanceRaw / divisor;

      spinner.stop();

      console.log(
        boxen(
          `${chalk.bold("TOKEN  :")} ${name} (${symbol})\n` +
            `${chalk.bold("ADDRESS:")} ${t.address}\n` +
            `${chalk.bold("BALANCE:")} ${chalk.green(
              balance.toString()
            )} ${symbol}`,
          { padding: 1, borderColor: "cyan", borderStyle: "round" }
        )
      );
    } catch (err) {
      spinner.fail(`Gagal cek ${t.name || t.symbol}`);
      console.log(
        chalk.red(
          `Error cek ${t.name || t.symbol} @ ${t.address}: ${err.message}`
        )
      );
    }
  }
}

// =========================
// START APP
// =========================

selectChainMenu();
