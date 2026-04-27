import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import { Product, User, Order, Transaction, Review } from "./src/types.js";
import * as dotenv from "dotenv";
import axios from "axios";
import { supabase } from "./src/lib/supabase.js";
import Stripe from "stripe";

dotenv.config();

const app = express();
const PORT = 3000;

let stripeClient: Stripe | null = null;
function getStripe() {
    if (!stripeClient) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
        stripeClient = new Stripe(key);
    }
    return stripeClient;
}

async function notifyAllUsers(message: string) {
    console.log(`[BROADCAST] Starting notification to all users: "${message.substring(0, 50)}..."`);
    const users = await getAllUsers();
    console.log(`[BROADCAST] Found ${users.length} users to notify.`);
    
    let success = 0;
    let failed = 0;

    for (const user of users) {
        try {
            await bot.telegram.sendMessage(user.id, message, { parse_mode: 'HTML' });
            success++;
            await new Promise(resolve => setTimeout(resolve, 50));
        } catch (e: any) {
            failed++;
            console.error(`[BROADCAST] Error notifying user ${user.id}:`, e.message);
        }
    }
    console.log(`[BROADCAST] Finished. Success: ${success}, Failed: ${failed}`);
}

function getTimestamp(ts: any): number {
    if (!ts) return 0;
    if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts).getTime();
    if (ts instanceof Date) return ts.getTime();
    return 0;
}

// Database helpers (Supabase)
async function getUser(id: string): Promise<User | null> {
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') console.error(`Error fetching user (${id}):`, error.message, error.details);
    return data;
}

async function getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('users').select('*');
    if (error) console.error("Error fetching all users:", error.message, error.details);
    return data || [];
}

async function saveUser(user: User) {
    const { error } = await supabase.from('users').upsert(user);
    if (error) console.error(`Error saving user (${user.id}):`, error.message, error.details);
}

async function updateUser(id: string, updates: Partial<User>) {
    const { error } = await supabase.from('users').update(updates).eq('id', id);
    if (error) console.error(`Error updating user (${id}):`, error.message, error.details);
}

async function getProducts(): Promise<Product[]> {
    const { data, error } = await supabase.from('products').select('*');
    if (error) console.error("Error fetching products:", error.message, error.details);
    return data || [];
}

async function getProduct(id: string): Promise<Product | null> {
    const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') console.error(`Error fetching product (${id}):`, error.message, error.details);
    return data;
}

async function updateProduct(id: string, updates: Partial<Product>) {
    const { error } = await supabase.from('products').update(updates).eq('id', id);
    if (error) console.error(`Error updating product (${id}):`, error.message, error.details);
}

async function saveProduct(product: Product) {
    const { error } = await supabase.from('products').upsert(product);
    if (error) console.error("Error saving product:", error.message, error.details);
}

async function deleteProduct(id: string) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) console.error("Error deleting product:", error.message, error.details);
}

async function createOrder(order: any) {
    const { error } = await supabase.from('orders').insert({
        ...order,
        timestamp: order.timestamp ? new Date(order.timestamp).toISOString() : new Date().toISOString()
    });
    if (error) console.error("Error creating order:", error.message, error.details);
}

async function getOrders(userId?: string): Promise<Order[]> {
    let query = supabase.from('orders').select('*').order('timestamp', { ascending: false });
    if (userId) query = query.eq('userId', userId);
    const { data, error } = await query;
    if (error) console.error("Error fetching orders:", error.message, error.details);
    return data || [];
}

async function getOrder(id: string): Promise<Order | null> {
    const { data, error } = await supabase.from('orders').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') console.error(`Error fetching order (${id}):`, error.message, error.details);
    return data;
}

async function getAllTransactions(userId?: string): Promise<Transaction[]> {
    let query = supabase.from('transactions').select('*').order('timestamp', { ascending: false });
    if (userId) query = query.eq('userId', userId);
    const { data, error } = await query;
    if (error) console.error("Error fetching transactions:", error.message, error.details);
    return data || [];
}

async function saveTransaction(transaction: any) {
    const { error } = await supabase.from('transactions').upsert({
        ...transaction,
        timestamp: transaction.timestamp ? new Date(transaction.timestamp).toISOString() : new Date().toISOString()
    });
    if (error) console.error("Error saving transaction:", error.message, error.details);
}

async function getSupportMessages(): Promise<any[]> {
    const { data, error } = await supabase.from('support_messages').select('*').order('timestamp', { ascending: false });
    if (error) console.error("Error fetching support messages:", error.message, error.details);
    return data || [];
}

async function saveSupportMessage(msg: any) {
    const { error } = await supabase.from('support_messages').insert({
        ...msg,
        timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString()
    });
    if (error) console.error("Error saving support message:", error.message, error.details);
}

async function updateTransaction(id: string, updates: Partial<Transaction>) {
    const { error } = await supabase.from('transactions').update(updates).eq('id', id);
    if (error) console.error(`Error updating transaction (${id}):`, error.message, error.details);
}


// Price Caching
const priceCache: Record<string, { price: number, timestamp: number }> = {};
async function getCachedPrice(currency: string): Promise<number> {
    const symbol = `${currency}USDT`;
    const now = Date.now();
    if (priceCache[symbol] && (now - priceCache[symbol].timestamp < 60000)) {
        return priceCache[symbol].price;
    }
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
        const price = parseFloat(res.data.price);
        priceCache[symbol] = { price, timestamp: now };
        return price;
    } catch (e) {
        console.error(`Error fetching price for ${symbol}:`, e);
        return priceCache[symbol]?.price || 0;
    }
}

// Bot instance
const token = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== "MY_TELEGRAM_BOT_TOKEN" 
    ? process.env.TELEGRAM_BOT_TOKEN 
    : "8717658589:AAGoQ0dyqlx-FPeA5qWURNMbRK0-1vHCqIM";

if (!token || token.includes("MY_TELEGRAM_BOT_TOKEN")) {
    console.error("CRITICAL: TELEGRAM_BOT_TOKEN is not set! Bot will not start.");
}

const bot = new Telegraf(token);

// Debug Middleware: Log all incoming updates
bot.use(async (ctx, next) => {
    console.log(`[BOT UPDATE] From: ${ctx.from?.id} (@${ctx.from?.username}) - Type: ${ctx.updateType}`);
    if (ctx.message && 'text' in ctx.message) {
        console.log(`[BOT MESSAGE] Text: ${ctx.message.text}`);
    }
    return next();
});

// Admin List - We'll add the first user as admin or use a specific one
const ADMINS = [6805161044, 8279468317]; 
const BOT_VERSION = 8; 

// Initializing the bot and logging identity
bot.telegram.getMe().then((me) => {
    console.log(`[BOT READY] @${me.username} is fully operational.`);
}).catch((err) => {
    console.error("[BOT START ERROR] Could not verify bot identity:", err.message);
});

// Global error handler for the bot
bot.catch((err: any, ctx: any) => {
    console.error(`Bot error for ${ctx.updateType}:`, err);
    try {
        ctx.reply("❌ An unexpected error occurred. Please try again later.");
    } catch (e) {}
});

async function isUserAdmin(ctx: any): Promise<boolean> {
    const telegramId = ctx.from.id.toString();
    const user = await getUser(telegramId);
    
    // Check DB flag OR if they are in the hardcoded list
    if (user?.isAdmin) return true;
    if (ADMINS.includes(ctx.from.id)) {
        // Automatically promote if they are in the list but not marked in DB
        if (user) {
            await updateUser(telegramId, { isAdmin: true });
        }
        return true;
    }
    return false;
}

// --- Bot Middleware for Registration and Version Check ---
bot.use(async (ctx, next) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return next();

    let user = await getUser(telegramId);
    
    // Auto-register if not found
    if (!user) {
        console.log(`[REGISTRATION] New user detected: ${telegramId}. Registering...`);
        const newUser: User = {
            id: telegramId,
            username: ctx.from?.username || "N/A",
            balance: 0,
            isAdmin: ADMINS.includes(ctx.from!.id),
            referralCount: 0,
            totalAffiliateEarnings: 0,
            v: BOT_VERSION
        };

        const updateText = (ctx.message as any)?.text;
        if (updateText?.startsWith("/start ") && !updateText.includes("stripe_")) {
            const payload = updateText.split(" ")[1];
            if (payload && payload !== telegramId) {
                const referrer = await getUser(payload);
                if (referrer) {
                    newUser.referredBy = payload;
                    await updateUser(payload, {
                        referralCount: (referrer.referralCount || 0) + 1
                    });
                    
                    try {
                        await bot.telegram.sendMessage(payload, `🎯 <b>New Referral!</b>\n\nUser @${ctx.from?.username || "SafeUser"} has joined using your link. You will earn $0.10 for every deposit they make!`, { parse_mode: 'HTML' });
                    } catch (e) {}
                }
            }
        }

        await saveUser(newUser);
        user = newUser;
    }

    // Handle Stripe Return for BOTH new and existing users
    const textStart = (ctx.message as any)?.text;
    if (textStart?.startsWith("/start ")) {
        const payload = textStart.split(" ")[1];
        if (payload === "stripe_success") {
            await ctx.reply("🎉 <b>Payment Successful!</b>\n\nYour transaction is being processed. It will take a few moments for the balance or product to be delivered.", { parse_mode: 'HTML' });
        } else if (payload === "stripe_cancel") {
            await ctx.reply("❌ <b>Payment Cancelled.</b>\n\nNo funds were deducted. You can try again from the Wallet menu.", { parse_mode: 'HTML' });
        }
    }

    // Skip version check for specific actions or if the user was just registered
    const updateText = (ctx.message as any)?.text;
    const updateData = (ctx.callbackQuery as any)?.data;

    if (
        updateText === "/start" || 
        updateText === "🔄 Update Bot" || 
        updateData === "force_update" ||
        updateText?.startsWith("/id")
    ) {
        return next();
    }

    // If user is not updated, force the update screen
    if (user.v === undefined || user.v < BOT_VERSION) {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery("⚠️ Update Required!", { show_alert: true });
        }
        return showUpdateRequired(ctx);
    }

    return next();
});

// --- Bot Logic ---

const WELCOME_PHOTO = "https://placehold.co/1200x600/000000/7a26c1/png?text=SMART+KEYS+%0A+DAILY";

bot.command("id", async (ctx) => {
    return ctx.replyWithHTML(`🆔 <b>Your User ID:</b> <code>${ctx.from.id}</code>\n\nTo become an admin, ensure this ID is present in the <code>ADMINS</code> array in <code>server.ts</code> and then type /start.`);
});

bot.start(async (ctx) => {
    console.log(`[START] command received from ${ctx.from.id}`);
    const telegramId = ctx.from.id.toString();
    const referralId = ctx.payload; // /start referralId
    
    let user = await getUser(telegramId);
    
    if (!user) {
        user = {
            id: telegramId,
            username: ctx.from.username,
            balance: 0,
            isAdmin: ADMINS.includes(ctx.from.id),
            referralCount: 0,
            totalAffiliateEarnings: 0,
            v: 0 // New users start at v0 and must click Update to activate
        };
        
        // Handle Referral
        if (referralId && referralId !== telegramId) {
            const referrer = await getUser(referralId);
            if (referrer) {
                user.referredBy = referralId;
                await updateUser(referralId, {
                    referralCount: (referrer.referralCount || 0) + 1
                });
                
                // Notify Referrer
                try {
                    await bot.telegram.sendMessage(referralId, `🎯 <b>New Referral!</b>\n\nUser @${ctx.from.username || "SafeUser"} has joined using your link. You will earn $0.10 for every deposit they make!`, { parse_mode: 'HTML' });
                } catch (e) {}
            }
        }

        await saveUser(user);
    }

    return showMainMenu(ctx, user);
});

async function showUpdateRequired(ctx: any) {
    const msg = `🚀 <b>New Update Available!</b>\n\nWe have added new features and security improvements. Please click the button below to update your bot interface and continue.`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Update Bot", "force_update")]
    ]);

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    return ctx.replyWithHTML(msg, keyboard);
}

bot.action("force_update", async (ctx) => {
    const telegramId = ctx.from!.id.toString();
    const user = await getUser(telegramId);
    if (user) {
        if (user.v === BOT_VERSION) {
            return ctx.answerCbQuery("✅ You have already updated the bot!");
        }
        await updateUser(telegramId, { v: BOT_VERSION });
        await ctx.answerCbQuery("✅ Bot Updated Successfully!");
        
        // Fetch fresh user for showMainMenu
        const updatedUser = await getUser(telegramId);
        return showMainMenu(ctx, updatedUser!);
    }
    return ctx.answerCbQuery("Error updating.");
});

async function showMainMenu(ctx: any, user: User) {
    const telegramId = user.id;
    const welcomeMsg = `✨<b>Welcome To Smart Keys Bot!</b>✨\n\n👤 <b>Your Name:</b> ${ctx.from.first_name}\n🏷 <b>Your Username:</b> @${ctx.from.username || "N/A"}\n🆔 <b>Your User ID:</b> <code>${telegramId}</code>\n💰 <b>Your Balance:</b> $${user.balance.toFixed(2)}`;
    
    // Referral info removed as requested previously or just simplified
    
    const keyboard = Markup.keyboard([
        ["👤 Profile", "💰 Wallet"],
        ["🛍 Products", "🧾 Transactions"],
        ["☎️ Support", "👥 Affiliate"],
        ["🔄 Update Bot"]
    ]).resize();

    try {
        return await ctx.replyWithPhoto(WELCOME_PHOTO, {
            caption: welcomeMsg,
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (e) {
        return ctx.replyWithHTML(welcomeMsg, keyboard);
    }
}

bot.hears("🔄 Update Bot", async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const user = await getUser(telegramId);
    if (user) {
        if (user.v === BOT_VERSION) {
            return ctx.reply("✅ You have already updated the bot.");
        }
        await updateUser(telegramId, { v: BOT_VERSION });
        await ctx.reply("✅ Bot Updated Successfully!");
        
        const updatedUser = await getUser(telegramId);
        return showMainMenu(ctx, updatedUser!);
    }
});

bot.action("main_menu", async (ctx) => {
    const telegramId = ctx.from!.id.toString();
    const user = await getUser(telegramId);
    if (!user) return ctx.answerCbQuery("User not found.");
    
    userStates.delete(ctx.from!.id);

    const welcomeMsg = `✨<b>Welcome To Smart Keys Bot!</b>✨\n\n👤 <b>Your Name:</b> ${ctx.from!.first_name}\n🏷 <b>Your Username:</b> @${ctx.from!.username || "N/A"}\n🆔 <b>Your User ID:</b> <code>${telegramId}</code>\n💰 <b>Your Balance:</b> $${user.balance.toFixed(2)}`;
    
    const keyboard = [
        [Markup.button.callback("👤 Profile", "profile_view"), Markup.button.callback("💰 Wallet", "wallet_menu")],
        [Markup.button.callback("🛍 Products", "products_list"), Markup.button.callback("🧾 Transactions", "transactions_menu")],
        [Markup.button.callback("☎️ Support", "support_menu"), Markup.button.callback("👥 Affiliate", "affiliate_menu")],
        [Markup.button.callback("🔄 Update Bot", "force_update")]
    ];

    try {
        await ctx.editMessageCaption(welcomeMsg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(keyboard)
        });
    } catch (e) {
        // Fallback
        try { await ctx.deleteMessage(); } catch (err) {}
        return ctx.replyWithHTML(welcomeMsg, Markup.keyboard([
            ["👤 Profile", "💰 Wallet"],
            ["🛍 Products", "🧾 Transactions"],
            ["☎️ Support", "👥 Affiliate"],
            ["🔄 Update Bot"]
        ]).resize());
    }
    return ctx.answerCbQuery();
});

bot.action("products_list", async (ctx) => {
    const prods = await getProducts();
    if (prods.length === 0) return ctx.answerCbQuery("No products available.");

    const buttons = prods.map((p: Product) => [Markup.button.callback(`🛒 ${p.name} - $${p.price} 🎁`, `view_product_${p.id}`)]);
    buttons.push([Markup.button.callback("⬅️ Back", "main_menu")]);
    
    await ctx.editMessageCaption("💎 <b>Select A Product To View Detail:</b>", {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
    });
    return ctx.answerCbQuery();
});

bot.action(/view_product_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const product = await getProduct(productId);
    if (!product) return ctx.answerCbQuery("Product not found.");

    const avgRating = product.reviews && product.reviews.length > 0 
        ? (product.reviews.reduce((acc: number, r: any) => acc + r.rating, 0) / product.reviews.length).toFixed(1)
        : "N/A";

    const msg = `🛒 <b>Product:</b> ${product.name}\n💰 <b>Price:</b> $${product.price.toFixed(2)}\n📦 <b>In Stock:</b> ${product.accounts?.length || 0}\n⭐ <b>Rating:</b> ${avgRating} (${product.reviews?.length || 0} reviews)\n\n🎁 <b>Bulk Discounts:</b>\n✅ 10-24 Accounts: <b>2% OFF</b>\n✅ 25+ Accounts: <b>5% OFF</b>\n\n<i>${product.category} Service</i>`;

    const buttons = [
        [Markup.button.callback("💳 Buy Now", `buy_${product.id}`)],
        [Markup.button.callback("⭐ View Reviews", `view_reviews_${product.id}`)],
        [Markup.button.callback("⬅️ Back to Products", "products_list")]
    ];

    await ctx.editMessageCaption(msg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
    });
    return ctx.answerCbQuery();
});

bot.action(/view_reviews_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const product = await getProduct(productId);
    if (!product) return ctx.answerCbQuery("Product not found.");

    let msg = `⭐ <b>Reviews for ${product.name}</b>\n\n`;
    if (!product.reviews || product.reviews.length === 0) {
        msg += "No reviews yet. Be the first to buy and review!";
    } else {
        product.reviews.slice(-5).forEach((r: any) => {
            msg += `👤 <b>${r.username}</b> (${"⭐".repeat(r.rating)})\n💬 ${r.comment}\n\n`;
        });
    }

    const buttons = [[Markup.button.callback("⬅️ Back to Product", `view_product_${product.id}`)]];
    await ctx.editMessageCaption(msg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
    });
    return ctx.answerCbQuery();
});

bot.hears("💰 Wallet", async (ctx) => {
    return showWalletMenu(ctx);
});

bot.hears("🧾 Transactions", async (ctx) => {
    return showTransactionHistory(ctx);
});

async function showTransactionHistory(ctx: any) {
    const telegramId = (ctx.from?.id || ctx.chat?.id).toString();
    const transactions = await getAllTransactions(telegramId);
    const orders = await getOrders(telegramId);

    if (transactions.length === 0 && orders.length === 0) {
        return ctx.reply("❌ <b>You don't have any transaction history yet.</b>", { parse_mode: 'HTML' });
    }

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    const msg = "🧾 <b>Your Transactions And Purchases</b>\n\nChoose an option below to view your account purchases or top-up history.";
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("📦 My Orders", "orders_list_page_0")],
        [Markup.button.callback("💸 Deposit History", "deposits_list_page_0")],
        [Markup.button.callback("⬅️ Back To Main Menu", "main_menu")]
    ]);

    return ctx.replyWithPhoto(WELCOME_PHOTO, {
        caption: msg,
        parse_mode: 'HTML',
        ...keyboard
    });
}

bot.action("transactions_menu", async (ctx) => {
    await showTransactionHistory(ctx);
    return ctx.answerCbQuery();
});

bot.action(/deposits_list_page_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const perPage = 5;
    const telegramId = ctx.from!.id.toString();
    const transactions = await getAllTransactions(telegramId);
    const deposits = transactions.filter((t: Transaction) => t.type === 'deposit').reverse();

    if (deposits.length === 0) {
        return ctx.answerCbQuery("No deposits found.");
    }

    const totalPages = Math.ceil(deposits.length / perPage);
    const startIndex = page * perPage;
    const currentPageDeposits = deposits.slice(startIndex, startIndex + perPage);

    let msg = `💸 <b>Your Deposits (Page ${page + 1}/${totalPages}):</b>\n\n`;
    const istOffset = 5.5 * 60 * 60 * 1000;

    currentPageDeposits.forEach((t: Transaction) => {
        const istTime = new Date(t.timestamp + istOffset).toLocaleString('en-IN', { timeZone: 'UTC' });
        const icon = t.status === 'completed' ? '✅' : (t.status === 'pending' ? '⏳' : '❌');
        msg += `${icon} <b>Amount:</b> $${t.amount.toFixed(2)}\n📅 <b>Date:</b> ${istTime}\n🆔 <code>${t.id}</code>\n\n`;
    });

    const buttons = [];
    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback("⬅️ Previous", `deposits_list_page_${page - 1}`));
    if (page < totalPages - 1) navButtons.push(Markup.button.callback("Next ➡️", `deposits_list_page_${page + 1}`));
    if (navButtons.length > 0) buttons.push(navButtons);

    buttons.push([Markup.button.callback("⬅️ Back", "transactions_menu")]);

    try {
        await ctx.editMessageCaption(msg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(buttons)
        });
    } catch (e) {
        await ctx.replyWithHTML(msg, Markup.inlineKeyboard(buttons));
    }
    return ctx.answerCbQuery();
});

async function editMenuSafe(ctx: any, msg: string, keyboard: any) {
    if (ctx.updateType === "callback_query") {
        try {
            await ctx.editMessageCaption(msg, { parse_mode: 'HTML', ...keyboard });
        } catch (e) {
            try {
                await ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard });
            } catch (err) {}
        }
    }
}

async function showWalletMenu(ctx: any) {
    const telegramId = (ctx.from?.id || ctx.chat?.id).toString();
    const user = await getUser(telegramId);
    const msg = `👛 <b>Your Wallet</b>\n\n<b>USD/USDT:</b> $${user?.balance.toFixed(2)}\n\nSelect a payment method to top up your balance.`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("💳 Card (Stripe)", "topup_stripe")],
        [Markup.button.callback("₿ BTC", "topup_btc"), Markup.button.callback("Ł LTC", "topup_ltc")],
        [Markup.button.callback("💠 USDT (BEP20)", "topup_usdt_bep20"), Markup.button.callback("🏦 USDT (TRC20)", "topup_usdt_trc20")],
        [Markup.button.callback("💎 USDT (ERC20)", "topup_usdt_erc20"), Markup.button.callback("Ξ ETH", "topup_eth")],
        [Markup.button.callback("☀️ SOL", "topup_sol")],
        [Markup.button.callback("🌐 Other Methods", "topup_other")],
        [Markup.button.callback("🔄 Refresh Balance", "wallet_menu"), Markup.button.callback("⬅️ Back To Main Menu", "main_menu")]
    ]);

    await editMenuSafe(ctx, msg, keyboard);
    if (ctx.updateType !== "callback_query") {
        try { await ctx.deleteMessage(); } catch (e) {}
        return ctx.replyWithPhoto(WELCOME_PHOTO, { caption: msg, parse_mode: 'HTML', ...keyboard });
    }
}

bot.action("topup_stripe", async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    const sent = await ctx.reply("💳 <b>Stripe Top-up</b>\n\nPlease enter the amount in USD you want to add to your wallet (Min $1):", { 
        parse_mode: 'HTML',
        ...Markup.keyboard([["⬅️ Return To Main Menu"]]).resize()
    });
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_STRIPE_TOPUP_AMT", data: { promptId: sent.message_id } });
});

bot.action("wallet_menu", async (ctx) => {
    await showWalletMenu(ctx);
    return ctx.answerCbQuery();
});

bot.hears("☎️ Support", async (ctx) => {
    try {
        await ctx.deleteMessage();
    } catch (e) {}

    const msg = `☎️ <b>Smart Keys Support</b>\n\nUsername: @SmarterKeysDaily\n\nNeed help? Choose an option below to contact us. You can either send a message directly through the bot or contact the owner on Telegram.`;
    
    return ctx.replyWithHTML(msg, Markup.inlineKeyboard([
        [Markup.button.callback("📩 Support Via Bot", "support_bot")],
        [Markup.button.url("👤 Contact Owner", "https://t.me/SmarterKeysDaily")],
        [Markup.button.callback("⬅️ Back To Main Menu", "main_menu")]
    ]));
});

bot.action("support_menu", async (ctx) => {
    const msg = `☎️ <b>Smart Keys Support</b>\n\nUsername: @SmarterKeysDaily\n\nNeed help? Choose an option below to contact us. You can either send a message directly through the bot or contact the owner on Telegram.`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("📩 Support Via Bot", "support_bot")],
        [Markup.button.url("👤 Contact Owner", "https://t.me/SmarterKeysDaily")],
        [Markup.button.callback("⬅️ Back To Main Menu", "main_menu")]
    ]);
    
    await editMenuSafe(ctx, msg, keyboard);
    return ctx.answerCbQuery();
});

bot.action("support_bot", async (ctx) => {
    try {
        await ctx.deleteMessage();
    } catch (e) {}
    const sent = await ctx.reply("📝 <b>Please type your message below.</b>\n\nOur admins will see your message and get back to you soon!", { 
        parse_mode: 'HTML',
        ...Markup.keyboard([["⬅️ Return To Main Menu"]]).resize()
    });
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_SUPPORT_MSG", data: { promptId: sent.message_id } });
});

bot.hears("⬅️ Return To Main Menu", async (ctx) => {
    const state = userStates.get(ctx.from.id);
    if (state?.data?.promptId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, state.data.promptId);
        } catch (e) {}
    }
    userStates.delete(ctx.from.id);
    const telegramId = ctx.from.id.toString();
    const user = await getUser(telegramId);
    if (!user) return ctx.reply("User not found.");
    
    try {
        await ctx.deleteMessage();
    } catch (e) {}

    const welcomeMsg = `✨<b>Welcome To Smart Keys Bot!</b>✨\n\n👤 <b>Your Name:</b> ${ctx.from.first_name}\n🏷 <b>Your Username:</b> @${ctx.from.username || "N/A"}\n🆔 <b>Your User ID:</b> <code>${telegramId}</code>\n💰 <b>Your Balance:</b> $${user.balance.toFixed(2)}`;
    
    const keyboard = Markup.keyboard([
        ["👤 Profile", "💰 Wallet"],
        ["🛍 Products", "🧾 Transactions"],
        ["☎️ Support", "👥 Affiliate"],
        ["🔄 Update Bot"]
    ]).resize();

    try {
        return await ctx.replyWithPhoto(WELCOME_PHOTO, {
            caption: welcomeMsg,
            parse_mode: 'HTML',
            ...keyboard
        });
    } catch (e) {
        return ctx.replyWithHTML(welcomeMsg, keyboard);
    }
});

bot.hears("🛍 Products", async (ctx) => {
    const products = await getProducts();
    if (products.length === 0) {
        return ctx.reply("❌ <b>No Products Available At The Moment.</b>", { parse_mode: 'HTML' });
    }

    const buttons = products.map((p: Product) => [Markup.button.callback(`🛒 ${p.name} - $${p.price} [Qty: ${p.accounts.length}]`, `buy_${p.id}`)]);
    buttons.push([Markup.button.callback("⬅️ Back To Main Menu", "main_menu")]);
    
    try {
        await ctx.deleteMessage();
    } catch (e) {}

    return ctx.reply("💎 <b>Select A Product To Purchase:</b>", {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
    });
});


const BTC_ADDRESS = process.env.BTC_ADDRESS || "bc1qynud2ydp9nnqklmu4hmv38nq92hkh9f7xhkv9s";
const LTC_ADDRESS = process.env.LTC_ADDRESS || "ltc1qnmpx7q5qavj367ukzjmtece7vq2u0e49mc6uxx";
const USDT_BEP20_ADDRESS = process.env.USDT_BEP20_ADDRESS || "0x8Ab66bf10f75B08c914c227a13158382A4A21Ac7";
const USDT_TRC20_ADDRESS = process.env.USDT_TRC20_ADDRESS || "TYn8sQZtXzG2fzbnVhKcuhTQqKLkLq2APT";
const SOL_ADDRESS = process.env.SOL_ADDRESS || "2JdkQPEPvCa3p6qziGHEBUKqXnkJ6upZ8aSUHFptQDBQ";
const ETH_ADDRESS = process.env.ETH_ADDRESS || "0x8Ab66bf10f75B08c914c227a13158382A4A21Ac7";
const USDT_ERC20_ADDRESS = process.env.USDT_ERC20_ADDRESS || "0x8Ab66bf10f75B08c914c227a13158382A4A21Ac7";

bot.action("topup_eth", (ctx) => {
    const msg = `Ξ <b>Top Up With ETH</b>\n\n📍 <b>Address:</b> <code>${ETH_ADDRESS}</code>\n\n✅ <b>After Payment:</b> Send your <b>Transaction ID (TXID / Hash)</b> here for auto-verification.`;
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_TXID", data: { currency: "ETH" } });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back To Wallet", "wallet_menu")]
    ]);
    return editMenuSafe(ctx, msg, keyboard);
});

bot.action("topup_usdt_erc20", (ctx) => {
    const msg = `💎 <b>Top Up With USDT (ERC20)</b>\n\n📍 <b>Address:</b> <code>${USDT_ERC20_ADDRESS}</code>\n\n✅ <b>After Payment:</b> Send your <b>Transaction ID (TXID / Hash)</b> here for auto-verification.`;
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_TXID", data: { currency: "USDT_ERC20" } });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back To Wallet", "wallet_menu")]
    ]);
    return editMenuSafe(ctx, msg, keyboard);
});

bot.action("topup_other", async (ctx) => {
    const msg = `🌐 <b>Other Payment Methods</b>\n\nFor any other method that is not available in the bot (such as Binance Pay, Perfect Money, etc.), please contact our support team directly.\n\n👤 <b>Support:</b> @SmarterKeysDaily\n\nSend a message to the admin with your preferred method!`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.url("💬 Message Support", "https://t.me/SmarterKeysDaily")],
        [Markup.button.callback("⬅️ Back To Wallet", "wallet_menu")]
    ]);
    return editMenuSafe(ctx, msg, keyboard);
});

bot.action("topup_btc", (ctx) => {
    const msg = `₿ <b>Top Up With BTC</b>\n\n📍 <b>Address:</b> <code>${BTC_ADDRESS}</code>\n\n✅ <b>After Payment:</b> Send your <b>Transaction ID (TXID / Hash)</b> here for auto-verification.`;
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_TXID", data: { currency: "BTC" } });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back To Wallet", "wallet_menu")]
    ]);
    return editMenuSafe(ctx, msg, keyboard);
});

bot.action("topup_ltc", (ctx) => {
    const msg = `Ł <b>Top Up With LTC</b>\n\n📍 <b>Address:</b> <code>${LTC_ADDRESS}</code>\n\n✅ <b>After Payment:</b> Send your <b>Transaction ID (TXID / Hash)</b> here for auto-verification.`;
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_TXID", data: { currency: "LTC" } });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back To Wallet", "wallet_menu")]
    ]);
    return editMenuSafe(ctx, msg, keyboard);
});

bot.action("topup_usdt_bep20", (ctx) => {
    const msg = `💠 <b>Top Up With USDT (BEP20)</b>\n\n📍 <b>Address:</b> <code>${USDT_BEP20_ADDRESS}</code>\n\n✅ <b>After Payment:</b> Send your <b>Transaction ID (TXID / Hash)</b> here for auto-verification.`;
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_TXID", data: { currency: "USDT_BEP20" } });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back To Wallet", "wallet_menu")]
    ]);
    return editMenuSafe(ctx, msg, keyboard);
});

bot.action("topup_usdt_trc20", (ctx) => {
    const msg = `🏦 <b>Top Up With USDT (TRC20)</b>\n\n📍 <b>Address:</b> <code>${USDT_TRC20_ADDRESS}</code>\n\n✅ <b>After Payment:</b> Send your <b>Transaction ID (TXID / Hash)</b> here for auto-verification.`;
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_TXID", data: { currency: "USDT_TRC20" } });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back To Wallet", "wallet_menu")]
    ]);
    return editMenuSafe(ctx, msg, keyboard);
});

bot.action("topup_sol", (ctx) => {
    const msg = `☀️ <b>Top Up With SOL</b>\n\n📍 <b>Address:</b> <code>${SOL_ADDRESS}</code>\n\n✅ <b>After Payment:</b> Send your <b>Transaction ID (TXID / Hash)</b> here for auto-verification.`;
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_TXID", data: { currency: "SOL" } });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back To Wallet", "wallet_menu")]
    ]);
    return editMenuSafe(ctx, msg, keyboard);
});


bot.hears("👥 Affiliate", async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const user = await getUser(telegramId);
    if (!user) return ctx.reply("User not found.");

    // Dynamic referral count
    const allUsers = await getAllUsers();
    const actualReferrals = allUsers.filter((u: User) => u.referredBy === telegramId).length;
    if (user.referralCount !== actualReferrals) {
        await updateUser(user.id, { referralCount: actualReferrals });
    }

    const botInfo = await ctx.telegram.getMe();
    const referralLink = `https://t.me/${botInfo.username}?start=${telegramId}`;
    const msg = `👥 <b>Affiliate Program</b>\n\nRefer your friends and earn money!\n\n💰 <b>Reward:</b> $0.10 Per Deposit\n📊 <b>Total Referrals:</b> ${actualReferrals}\n💵 <b>Total Earned:</b> $${(user.totalAffiliateEarnings || 0).toFixed(2)}\n\n🔗 <b>Your Referral Link:</b>\n<code>${referralLink}</code>\n\nShare this link to start earning!`;

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    return ctx.replyWithPhoto(WELCOME_PHOTO, {
        caption: msg,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("⬅️ Back To Main Menu", "main_menu")]
        ])
    });
});

bot.action("affiliate_menu", async (ctx) => {
    const telegramId = ctx.from!.id.toString();
    const user = await getUser(telegramId);
    if (!user) return ctx.answerCbQuery("User not found.");

    // Dynamic referral count
    const allUsers = await getAllUsers();
    const actualReferrals = allUsers.filter((u: User) => u.referredBy === telegramId).length;
    if (user.referralCount !== actualReferrals) {
        await updateUser(user.id, { referralCount: actualReferrals });
    }

    const botInfo = await ctx.telegram.getMe();
    const referralLink = `https://t.me/${botInfo.username}?start=${telegramId}`;
    const msg = `👥 <b>Affiliate Program</b>\n\nRefer your friends and earn money!\n\n💰 <b>Reward:</b> $0.10 Per Deposit\n📊 <b>Total Referrals:</b> ${actualReferrals}\n💵 <b>Total Earned:</b> $${(user.totalAffiliateEarnings || 0).toFixed(2)}\n\n🔗 <b>Your Referral Link:</b>\n<code>${referralLink}</code>`;

    await ctx.editMessageCaption(msg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("⬅️ Back", "main_menu")]
        ])
    });
    return ctx.answerCbQuery();
});
bot.hears("👤 Profile", async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const user = await getUser(telegramId);
    
    try {
        await ctx.deleteMessage();
    } catch (e) {}

    const profileMsg = `✨ <b>Your Profile Detail</b> ✨\n\n👤 <b>Your Name:</b> ${ctx.from.first_name}\n🏷 <b>Your Username:</b> @${ctx.from.username || "N/A"}\n🆔 <b>Your User ID:</b> <code>${telegramId}</code>\n💰 <b>Your Balance:</b> $${user?.balance.toFixed(2)}\n👥 <b>Referrals:</b> ${user?.referralCount || 0}`;

    try {
        return await ctx.replyWithPhoto(WELCOME_PHOTO, {
            caption: profileMsg,
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback("⬅️ Back To Main Menu", "main_menu")]
            ])
        });
    } catch (e) {
        return ctx.replyWithHTML(profileMsg, Markup.inlineKeyboard([
            [Markup.button.callback("⬅️ Back To Main Menu", "main_menu")]
        ]));
    }
});

bot.hears("🧾 Transactions", async (ctx) => {
    return showTransactionHistory(ctx);
});

bot.action(/orders_list_page_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const perPage = 10;
    const telegramId = ctx.from!.id.toString();
    const orders = await getOrders(telegramId);

    if (orders.length === 0) {
        return ctx.answerCbQuery("No orders found.");
    }

    const totalPages = Math.ceil(orders.length / perPage);
    const startIndex = page * perPage;
    const currentPageOrders = orders.slice(startIndex, startIndex + perPage);

    let msg = `📦 <b>Your Orders (Page ${page + 1}/${totalPages}):</b>\n\n`;
    const buttons = [];

    currentPageOrders.forEach((o: Order) => {
        msg += `🔹 <b>${o.productName}</b> - $${o.amount.toFixed(2)}\n`;
        buttons.push([Markup.button.callback(`🔍 Detail: ${o.productName.substring(0, 15)}...`, `view_order_${o.id}`)]);
    });

    const navButtons = [];
    if (page > 0) navButtons.push(Markup.button.callback("⬅️ Previous", `orders_list_page_${page - 1}`));
    if (page < totalPages - 1) navButtons.push(Markup.button.callback("Next ➡️", `orders_list_page_${page + 1}`));
    if (navButtons.length > 0) buttons.push(navButtons);

    buttons.push([Markup.button.callback("⬅️ Back", "transactions_menu")]);

    try {
        await ctx.editMessageCaption(msg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(buttons)
        });
    } catch (e) {
        await ctx.replyWithHTML(msg, Markup.inlineKeyboard(buttons));
    }
    return ctx.answerCbQuery();
});

bot.action(/view_order_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    const order = await getOrder(orderId);

    if (!order) return ctx.answerCbQuery("Order not found.");

    // IST is UTC+5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const tsNum = getTimestamp(order.timestamp);
    const istTime = new Date(tsNum + istOffset).toLocaleString('en-IN', { timeZone: 'UTC' }) + " (IST)";

    const msg = `🧾 <b>Order Details</b>\n\n` +
                `🆔 <b>Order ID:</b> <code>${order.id}</code>\n` +
                `🛍 <b>Product:</b> ${order.productName}\n` +
                `💰 <b>Amount:</b> $${order.amount.toFixed(2)}\n` +
                `⏰ <b>Date:</b> ${istTime}\n\n` +
                `🔑 <b>Account Detail:</b>\n<code>${order.accountDetail}</code>`;

    return ctx.editMessageCaption(msg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("⭐ Leave a Review", `leave_review_${order.productId}`)],
            [Markup.button.callback("⬅️ Back to Orders", "orders_list_page_0")]
        ])
    });
});

// Admin Panel Command
bot.command("admin", async (ctx) => {
    if (!(await isUserAdmin(ctx))) {
        return ctx.reply("❌ Invalid command.");
    }

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    return ctx.reply("🛠 Admin Panel Options:", Markup.inlineKeyboard([
        [Markup.button.callback("🛍 Products", "admin_products_menu"), Markup.button.callback("📢 Broadcast", "admin_broadcast")],
        [Markup.button.callback("👥 Admins", "admin_manage_admins"), Markup.button.callback("💰 Balance", "admin_manage_balance")],
        [Markup.button.callback("📩 Messages", "admin_view_messages"), Markup.button.callback("📊 TXs", "admin_view_tx")],
        [Markup.button.callback("📈 Statistics", "admin_stats"), Markup.button.callback("🏠 Main Menu", "main_menu")]
    ]));
});

bot.action("admin_view_messages", async (ctx) => {
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Invalid action.", { show_alert: true });

    const supportMessages = await getSupportMessages();
    if (supportMessages.length === 0) {
        return ctx.answerCbQuery("No support messages found.", { show_alert: true });
    }

    let msg = "📩 <b>Support Messages from Users:</b>\n\n";
    supportMessages.slice(0, 10).forEach((sm: any) => {
        const ts = typeof sm.timestamp === 'object' && 'toDate' in sm.timestamp ? (sm.timestamp as any).toDate() : new Date(sm.timestamp);
        msg += `👤 <b>${sm.name}</b> (@${sm.username})\n🆔 ID: <code>${sm.userId}</code>\n💬: ${sm.message}\n⏰ ${ts.toLocaleString()}\n\n`;
    });

    msg += `ℹ️ <b>How to Reply:</b>\nUse command <code>/reply [User ID] [Message]</code> to send a response to any user.`;

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    return ctx.replyWithHTML(msg, Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back to Admin Panel", "admin_back")],
        [Markup.button.callback("🏠 Main Menu", "main_menu")]
    ]));
});

bot.action(/leave_review_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    try {
        await ctx.deleteMessage();
    } catch (e) {}

    const sent = await ctx.reply("✍️ <b>Please write your review for the product:</b>", {
        parse_mode: 'HTML',
        ...Markup.keyboard([["⬅️ Return To Main Menu"]]).resize()
    });

    userStates.set(ctx.from!.id, {
        action: "WAITING_FOR_REVIEW",
        data: { productId, promptId: sent.message_id }
    });
    return ctx.answerCbQuery();
});
bot.action("admin_manage_admins", async (ctx) => {
    if (!(await isUserAdmin(ctx))) return ctx.answerCbQuery("❌ Access Denied.");
    const msg = "👥 <b>Admin Management</b>\n\nChoose an action below:";
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("➕ Add Admin", "admin_add_wizard"), Markup.button.callback("➖ Remove Admin", "admin_remove_wizard")],
        [Markup.button.callback("⬅️ Back to Admin Panel", "admin_back")]
    ]);
    return ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard });
});

bot.action("admin_manage_balance", async (ctx) => {
    if (!(await isUserAdmin(ctx))) return ctx.answerCbQuery("❌ Access Denied.");
    const msg = "💰 <b>Balance Management</b>\n\nChoose an action below:";
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("➕ Add Balance", "balance_add_wizard"), Markup.button.callback("➖ Remove Balance", "balance_remove_wizard")],
        [Markup.button.callback("🧹 Reset Balance", "balance_reset_wizard")],
        [Markup.button.callback("⬅️ Back to Admin Panel", "admin_back")]
    ]);
    return ctx.editMessageText(msg, { parse_mode: 'HTML', ...keyboard });
});

bot.action("admin_add_wizard", async (ctx) => {
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_ADMIN_ADD_ID" });
    return ctx.reply("🆔 <b>Please enter the User ID you want to make an admin:</b>", { parse_mode: 'HTML', ...Markup.keyboard([["⬅️ Return To Main Menu"]]).resize() });
});

bot.action("admin_remove_wizard", async (ctx) => {
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_ADMIN_REMOVE_ID" });
    return ctx.reply("🆔 <b>Please enter the User ID you want to remove from admins:</b>", { parse_mode: 'HTML', ...Markup.keyboard([["⬅️ Return To Main Menu"]]).resize() });
});

bot.action("balance_add_wizard", async (ctx) => {
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_BALANCE_ADD_ID" });
    return ctx.reply("🆔 <b>Please enter the User ID:</b>", { parse_mode: 'HTML', ...Markup.keyboard([["⬅️ Return To Main Menu"]]).resize() });
});

bot.action("balance_remove_wizard", async (ctx) => {
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_BALANCE_REMOVE_ID" });
    return ctx.reply("🆔 <b>Please enter the User ID:</b>", { parse_mode: 'HTML', ...Markup.keyboard([["⬅️ Return To Main Menu"]]).resize() });
});

bot.action("balance_reset_wizard", async (ctx) => {
    userStates.set(ctx.from!.id, { action: "WAITING_FOR_BALANCE_RESET_ID" });
    return ctx.reply("🆔 <b>Please enter the User ID to RESET balance:</b>", { parse_mode: 'HTML', ...Markup.keyboard([["⬅️ Return To Main Menu"]]).resize() });
});

// Reply to Support Message
bot.command("reply", async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const currentUser = await getUser(telegramId);
    
    if (!currentUser?.isAdmin) {
        return ctx.reply("❌ Invalid command.");
    }

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    const args = ctx.message.text.split(" ");
    if (args.length < 3) {
        return ctx.replyWithHTML("❌ <b>Missing Arguments.</b>\n\nUsage: <code>/reply [User ID] [Message Content]</code>");
    }

    const targetId = args[1];
    const messageContent = args.slice(2).join(" ");

    try {
        await ctx.telegram.sendMessage(targetId, `📩 <b>Admin Replied To Your Message:</b>\n\n${messageContent}`, { parse_mode: 'HTML' });
        return ctx.replyWithHTML(`✅ <b>Reply sent to User ID:</b> <code>${targetId}</code>`);
    } catch (e) {
        console.error(`Failed to send reply to ${targetId}:`, e);
        return ctx.replyWithHTML(`❌ <b>Failed to send message.</b> User might have blocked the bot.`);
    }
});

// Broadcast Command
bot.command("broadcast", async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const currentUser = await getUser(telegramId);
    
    if (!currentUser?.isAdmin) {
        return ctx.reply("❌ Invalid command.");
    }

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    const message = ctx.message.text.split(" ").slice(1).join(" ");
    if (!message) {
        return ctx.reply("Usage: /broadcast [Message Content]");
    }

    const users = await getAllUsers();
    let successCount = 0;
    let failCount = 0;

    const statusMsg = await ctx.reply(`📢 <b>Sending Broadcast To ${users.length} Users...</b>`, { parse_mode: 'HTML' });

    for (const user of users) {
        try {
            await ctx.telegram.sendMessage(user.id, `📢 <b>IMPORTANT NOTIFICATION</b>\n\n${message}`, { parse_mode: 'HTML' });
            successCount++;
        } catch (e) {
            failCount++;
        }
    }

    return ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `✅ <b>Broadcast Completed!</b>\n\n🟢 Success: ${successCount}\n🔴 Failed: ${failCount}`, { parse_mode: 'HTML' });
});

// User State for Wizard-like interactions
const userStates = new Map<number, { action: string, data?: any }>();

bot.action(/buy_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const product = await getProduct(productId);
    const user = await getUser(ctx.from!.id.toString());

    if (!product) return ctx.answerCbQuery("Product not found.");
    if (!user) return ctx.answerCbQuery("User not found.");
    if (product.accounts.length === 0) return ctx.answerCbQuery("Out of stock!");
    
    // Check if user has at least enough for 1
    if (user.balance < product.price) return ctx.reply("Insufficient balance. Please top up your wallet.");

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    const maxStock = product.accounts.length;
    const sent = await ctx.reply(`🔢 <b>Please Enter The Quantity How Much You Want To Purchase (Max ${maxStock})</b>`, {
        parse_mode: 'HTML',
        ...Markup.keyboard([["⬅️ Return To Main Menu"]]).resize()
    });

    userStates.set(ctx.from!.id, { 
        action: "WAITING_FOR_PURCHASE_QTY", 
        data: { 
            productId: product.id, 
            promptId: sent.message_id 
        } 
    });
    return ctx.answerCbQuery();
});

// Stripe Session Helper
async function createStripeSession(userId: string, type: 'topup' | 'purchase', amountOrProduct: any) {
    const stripe = getStripe();
    let sessionData: Stripe.Checkout.SessionCreateParams;

    if (type === 'topup') {
        sessionData = {
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: 'Wallet Top Up', description: 'Adding balance to SmarterKeys Wallet' },
                    unit_amount: Math.round(amountOrProduct.amount * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `https://t.me/SmarterKeysDailyBot?start=stripe_success`,
            cancel_url: `https://t.me/SmarterKeysDailyBot?start=stripe_cancel`,
            metadata: { userId, type: 'topup', amount: amountOrProduct.amount.toString() }
        };
    } else {
        const { product, quantity, totalPrice } = amountOrProduct;
        sessionData = {
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: product.name, description: `Purchase of ${quantity} keys` },
                    unit_amount: Math.round((totalPrice / quantity) * 100),
                },
                quantity: quantity,
            }],
            mode: 'payment',
            success_url: `https://t.me/SmarterKeysDailyBot?start=stripe_success`,
            cancel_url: `https://t.me/SmarterKeysDailyBot?start=stripe_cancel`,
            metadata: { 
                userId, 
                type: 'purchase', 
                productId: product.id, 
                quantity: quantity.toString(),
                totalPrice: totalPrice.toString()
            }
        };
    }

    const session = await stripe.checkout.sessions.create(sessionData);
    return session.url;
}

bot.on("text", async (ctx, next) => {
    const state = userStates.get(ctx.from.id);
    if (!state) return next();

    const text = ctx.message.text.trim();

    // Admin Wizards
    if (state.action === "WAITING_FOR_STRIPE_TOPUP_AMT") {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount < 1) {
            return ctx.reply("❌ <b>Invalid amount.</b> Please enter a number greater than or equal to 1.", { parse_mode: 'HTML' });
        }

        try {
            const stripeLink = await createStripeSession(ctx.from.id.toString(), 'topup', { amount });
            userStates.delete(ctx.from.id);
            return ctx.reply(`💳 <b>Top-up Amount: $${amount.toFixed(2)}</b>\n\nClick the button below to complete your payment:`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.url("💳 Pay with Card", stripeLink)],
                    [Markup.button.callback("⬅️ Back", "wallet_menu")]
                ])
            });
        } catch (e: any) {
            console.error("Stripe Session Error:", e.message);
            return ctx.reply("❌ Failed to generate payment link. Please try again later or contact support.");
        }
    }

    if (state.action === "WAITING_FOR_ADMIN_ADD_ID") {
        const targetId = text;
        const targetUser = await getUser(targetId);
        if (targetUser) {
            await updateUser(targetId, { isAdmin: true });
        } else {
            await saveUser({ 
                id: targetId, 
                username: "Admin", 
                balance: 0, 
                isAdmin: true, 
                referralCount: 0, 
                totalAffiliateEarnings: 0, 
                v: BOT_VERSION 
            });
        }
        userStates.delete(ctx.from.id);
        return ctx.reply(`✅ User ${targetId} is now an Admin.`, Markup.keyboard([["👤 Profile", "💰 Wallet"], ["🛍 Products", "🧾 Transactions"], ["☎️ Support", "👥 Affiliate"], ["🔄 Update Bot"]]).resize());
    }

    if (state.action === "WAITING_FOR_ADMIN_REMOVE_ID") {
        const targetId = text;
        await updateUser(targetId, { isAdmin: false });
        userStates.delete(ctx.from.id);
        return ctx.reply(`✅ User ${targetId} admin privileges removed.`, Markup.keyboard([["👤 Profile", "💰 Wallet"], ["🛍 Products", "🧾 Transactions"], ["☎️ Support", "👥 Affiliate"], ["🔄 Update Bot"]]).resize());
    }

    if (state.action === "WAITING_FOR_BALANCE_ADD_ID") {
        userStates.set(ctx.from.id, { action: "WAITING_FOR_BALANCE_ADD_AMT", data: { targetId: text } });
        return ctx.reply(`💰 How much balance to ADD for ${text}?`);
    }

    if (state.action === "WAITING_FOR_BALANCE_ADD_AMT") {
        const amount = parseFloat(text);
        const targetId = state.data.targetId;
        if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid amount.");
        const user = await getUser(targetId);
        if (!user) return ctx.reply("❌ User not found.");
        const newBal = (user.balance || 0) + amount;
        await updateUser(targetId, { balance: newBal });
        await saveTransaction({ 
            id: `adj_${Date.now()}`,
            userId: targetId, 
            amount, 
            type: 'deposit', 
            status: 'completed', 
            description: 'Admin adjustment' 
        });
        userStates.delete(ctx.from.id);
        try { await bot.telegram.sendMessage(targetId, `💰 Admin added $${amount.toFixed(2)} to your balance!`); } catch (e) {}
        return ctx.reply(`✅ Added $${amount} to ${targetId}.`, Markup.keyboard([["👤 Profile", "💰 Wallet"], ["🛍 Products", "🧾 Transactions"], ["☎️ Support", "👥 Affiliate"], ["🔄 Update Bot"]]).resize());
    }

    if (state.action === "WAITING_FOR_BALANCE_REMOVE_ID") {
        userStates.set(ctx.from.id, { action: "WAITING_FOR_BALANCE_REMOVE_AMT", data: { targetId: text } });
        return ctx.reply(`💰 How much balance to REMOVE from ${text}?`);
    }

    if (state.action === "WAITING_FOR_BALANCE_REMOVE_AMT") {
        const amount = parseFloat(text);
        const targetId = state.data.targetId;
        if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid amount.");
        const user = await getUser(targetId);
        if (!user) return ctx.reply("❌ User not found.");
        const newBal = Math.max(0, (user.balance || 0) - amount);
        await updateUser(targetId, { balance: newBal });
        await saveTransaction({ 
            id: `adj_${Date.now()}`,
            userId: targetId, 
            amount: -amount, 
            type: 'withdrawal', 
            status: 'completed', 
            description: 'Admin adjustment' 
        });
        userStates.delete(ctx.from.id);
        try { await bot.telegram.sendMessage(targetId, `💰 Admin removed $${amount.toFixed(2)} from your balance.`); } catch (e) {}
        return ctx.reply(`✅ Removed $${amount} from ${targetId}.`, Markup.keyboard([["👤 Profile", "💰 Wallet"], ["🛍 Products", "🧾 Transactions"], ["☎️ Support", "👥 Affiliate"], ["🔄 Update Bot"]]).resize());
    }

    if (state.action === "WAITING_FOR_BALANCE_RESET_ID") {
        const targetId = text;
        const user = await getUser(targetId);
        if (!user) return ctx.reply("❌ User not found.");
        await updateUser(targetId, { balance: 0 });
        userStates.delete(ctx.from.id);
        try { await bot.telegram.sendMessage(targetId, `💰 Admin has reset your balance to $0.00.`); } catch (e) {}
        return ctx.reply(`✅ Balance reset for ${targetId}.`, Markup.keyboard([["👤 Profile", "💰 Wallet"], ["🛍 Products", "🧾 Transactions"], ["☎️ Support", "👥 Affiliate"], ["🔄 Update Bot"]]).resize());
    }

    if (state?.action === "WAITING_FOR_PURCHASE_QTY") {
        const qty = parseInt(text);
        const product = await getProduct(state.data.productId);
        const user = await getUser(ctx.from.id.toString());

        if (isNaN(qty) || qty <= 0) return ctx.reply("❌ Invalid quantity. Please enter a positive number.");
        if (!product || !user) {
            userStates.delete(ctx.from.id);
            return ctx.reply("❌ Data not found.");
        }

        if (qty > product.accounts.length) {
            return ctx.reply(`❌ Not enough stock! Max available: ${product.accounts.length}`);
        }

        let totalPrice = product.price * qty;
        let discount = 0;
        if (qty >= 25) {
            discount = 0.05;
        } else if (qty >= 10) {
            discount = 0.02;
        }

        if (discount > 0) {
            totalPrice = totalPrice * (1 - discount);
        }

        if (user.balance < totalPrice) {
            const stripeLink = await createStripeSession(user.id, 'purchase', { product, quantity: qty, totalPrice });
            return ctx.reply(`❌ <b>Insufficient balance!</b>\n\nTotal cost: $${totalPrice.toFixed(2)}${discount > 0 ? ` (after ${discount * 100}% discount)` : ""}.\nYour balance: $${user.balance.toFixed(2)}\n\n💳 You can pay directly using Stripe (Card) below:`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.url("💳 Pay via Stripe", stripeLink)],
                    [Markup.button.callback("⬅️ Back", "main_menu")]
                ])
            });
        }

        // Deleting prompt
        if (state.data?.promptId) {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, state.data.promptId); } catch (e) {}
        }

        // Process Multibuy
        const accountsBought = product.accounts.splice(0, qty);
        user.balance -= totalPrice;
        
        const accountsText = accountsBought.join("\n");
        const orderId = Math.random().toString(36).substr(2, 9);
        
        await createOrder({
            id: orderId,
            userId: user.id,
            productId: product.id,
            productName: product.name,
            accountDetail: accountsText,
            amount: totalPrice,
            timestamp: new Date().toISOString()
        });

        await saveTransaction({
            id: `tx_${Date.now()}`,
            userId: user.id,
            amount: totalPrice,
            type: 'purchase',
            status: 'completed',
            timestamp: new Date().toISOString()
        });

        // Update product stock and user balance
        await updateProduct(product.id, { accounts: product.accounts });
        await updateUser(user.id, { balance: user.balance });

        userStates.delete(ctx.from.id);

        const discountApplied = qty >= 25 ? 5 : (qty >= 10 ? 2 : 0);
        let purchaseMsg = `✅ <b>Purchase Successful!</b>\n\nProduct: ${product.name}\nQuantity: ${qty}\nTotal Amount: $${totalPrice.toFixed(2)}`;
        if (discountApplied > 0) purchaseMsg += `\n🎁 <b>Discount Applied:</b> ${discountApplied}% OFF`;
        purchaseMsg += `\n\n🔑 <b>Account Details:</b>\n<code>${accountsText}</code>\n\nEnjoy your service!`;

        return ctx.replyWithHTML(purchaseMsg, Markup.inlineKeyboard([
            [Markup.button.callback("⭐ Leave a Review", `leave_review_${product.id}`)],
            [Markup.button.callback("🏠 Main Menu", "main_menu")]
        ]));
    }

    if (state?.action === "ADMIN_WIZARD_ADD_ADMIN_ID") {
        const targetId = ctx.message.text.trim();
        const targetUser = await getUser(targetId);
        if (!targetUser) return ctx.reply(`❌ User with ID ${targetId} not found in database.`);
        
        await updateUser(targetId, { isAdmin: true });
        userStates.delete(ctx.from.id);
        return ctx.reply(`✅ <b>Success!</b>\n\nUser @${targetUser.username || "Agent"} (ID: <code>${targetId}</code>) is now an Admin.`, { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back to Admin Panel", "admin_back")]])
        });
    }

    if (state?.action === "ADMIN_WIZARD_REMOVE_ADMIN_ID") {
        const targetId = ctx.message.text.trim();
        if (ADMINS.includes(parseInt(targetId))) {
            return ctx.reply("❌ This is a Super Admin (hardcoded in server.ts) and cannot be removed via the bot.");
        }
        const targetUser = await getUser(targetId);
        if (!targetUser) return ctx.reply(`❌ User with ID ${targetId} not found in database.`);
        
        await updateUser(targetId, { isAdmin: false });
        userStates.delete(ctx.from.id);
        return ctx.reply(`✅ <b>Success!</b>\n\nUser @${targetUser.username || "Agent"} (ID: <code>${targetId}</code>) has been removed from Admins.`, { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back to Admin Panel", "admin_back")]])
        });
    }

    if (state?.action === "ADMIN_WIZARD_BAL_ADD_UID") {
        const targetId = ctx.message.text.trim();
        const targetUser = await getUser(targetId);
        if (!targetUser) return ctx.reply(`❌ User with ID ${targetId} not found.`);
        
        userStates.set(ctx.from.id, { action: "ADMIN_WIZARD_BAL_ADD_VAL", data: { targetId } });
        return ctx.reply(`💰 User: @${targetUser.username || "User"} (Bal: $${targetUser.balance.toFixed(2)})\n\n<b>How much balance do you want to ADD?</b>`, { parse_mode: 'HTML' });
    }

    if (state?.action === "ADMIN_WIZARD_BAL_ADD_VAL") {
        const amount = parseFloat(ctx.message.text);
        if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid amount. Enter a positive number.");
        
        const targetId = state.data.targetId;
        const targetUser = await getUser(targetId);
        if (!targetUser) return ctx.reply("❌ User lost.");
        
        const newBal = (targetUser.balance || 0) + amount;
        await updateUser(targetId, { balance: newBal });
        
        await saveTransaction({
            id: `adj_${Date.now()}`,
            userId: targetId,
            amount: amount,
            type: 'deposit',
            status: 'completed',
            timestamp: Date.now()
        });

        userStates.delete(ctx.from.id);
        ctx.reply(`✅ <b>Success!</b>\n\nAdded $${amount.toFixed(2)} to User ${targetId}.\nNew Balance: $${newBal.toFixed(2)}`, { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back", "admin_manage_balance")]])
        });

        try {
            await bot.telegram.sendMessage(targetId, `💰 <b>Bonus Received!</b>\n\nAdmin has added $${amount.toFixed(2)} to your wallet.\nNew Balance: $${newBal.toFixed(2)}`, { parse_mode: 'HTML' });
        } catch (e) {}
        return;
    }

    if (state?.action === "ADMIN_WIZARD_BAL_RM_UID") {
        const targetId = ctx.message.text.trim();
        const targetUser = await getUser(targetId);
        if (!targetUser) return ctx.reply(`❌ User with ID ${targetId} not found.`);
        
        userStates.set(ctx.from.id, { action: "ADMIN_WIZARD_BAL_RM_VAL", data: { targetId } });
        return ctx.reply(`💰 User: @${targetUser.username || "User"} (Bal: $${targetUser.balance.toFixed(2)})\n\n<b>How much balance do you want to REMOVE?</b>`, { parse_mode: 'HTML' });
    }

    if (state?.action === "ADMIN_WIZARD_BAL_RM_VAL") {
        const amount = parseFloat(ctx.message.text);
        if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid amount. Enter a positive number.");
        
        const targetId = state.data.targetId;
        const targetUser = await getUser(targetId);
        if (!targetUser) return ctx.reply("❌ User lost.");
        
        const newBal = Math.max(0, (targetUser.balance || 0) - amount);
        await updateUser(targetId, { balance: newBal });
        
        userStates.delete(ctx.from.id);
        return ctx.reply(`✅ <b>Success!</b>\n\nRemoved $${amount.toFixed(2)} from User ${targetId}.\nNew Balance: $${newBal.toFixed(2)}`, { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back", "admin_manage_balance")]])
        });
    }

    if (state?.action === "ADMIN_WIZARD_BAL_EMPTY_UID") {
        const targetId = ctx.message.text.trim();
        const targetUser = await getUser(targetId);
        if (!targetUser) return ctx.reply(`❌ User with ID ${targetId} not found.`);
        
        await updateUser(targetId, { balance: 0 });
        userStates.delete(ctx.from.id);
        return ctx.reply(`🧹 <b>Wallet Cleared!</b>\n\nBalance for User ${targetId} is now <b>$0.00</b>.`, { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back", "admin_manage_balance")]])
        });
    }

    if (state?.action === "WAITING_FOR_REVIEW") {
        const reviewText = ctx.message.text.trim();
        if (reviewText.length < 5) return ctx.reply("❌ Review too short. Please write at least 5 characters.");
        
        const productId = state.data.productId;
        const product = await getProduct(productId);
        if (!product) return ctx.reply("Product not found.");

        const reviews = product.reviews || [];
        reviews.push({
            userId: ctx.from.id.toString(),
            username: ctx.from.username || "SafeUser",
            rating: 5, // Defaulting to 5 for now as we don't have stars UI in simple prompt
            comment: reviewText,
            timestamp: Date.now()
        });

        await updateProduct(product.id, { reviews });
        userStates.delete(ctx.from.id);
        return ctx.reply("✅ <b>Thank you for your review!</b>", {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback("🏠 Main Menu", "main_menu")]])
        });
    }

    if (state?.action === "WAITING_FOR_SUPPORT_MSG") {
        const userMsg = ctx.message.text.trim();
        if (userMsg.length < 5) return ctx.reply("❌ Message too short. Please describe your issue clearly.");

        // Delete prompt message
        if (state.data?.promptId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, state.data.promptId);
            } catch (e) {}
        }

        const supportMsg = {
            id: `msg_${Date.now()}`,
            userId: ctx.from.id.toString(),
            username: ctx.from.username || "N/A",
            name: ctx.from.first_name,
            message: userMsg,
            timestamp: Date.now()
        };

        await saveSupportMessage(supportMsg);
        
        userStates.delete(ctx.from.id);
        return ctx.reply("✅ <b>Your message has been sent to our admins!</b>\n\nThank you for reaching out. We will get back to you as soon as possible.", { 
            parse_mode: 'HTML',
            ...Markup.keyboard([
                ["👤 Profile", "💰 Wallet"],
                ["🛍 Products", "🧾 Transactions"],
                ["☎️ Support", "👥 Affiliate"],
                ["🔄 Update Bot"]
            ]).resize()
        });
    }

    if (state?.action === "WAITING_FOR_TXID") {
        const txId = ctx.message.text.trim();
        const currency = state.data.currency;

        const statusMsg = await ctx.reply(`Verifying ${currency} payment... Please wait ⏳`);

        try {
            const verification = await verifyCryptoPayment(txId, currency);
            
            if (verification.success) {
                const user = await getUser(ctx.from.id.toString());
                if (!user) {
                    await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, "❌ User not found.");
                    return;
                }
                
                user.balance += verification.amountUSD;
                
                await saveTransaction({
                    id: `dep_${Date.now()}`,
                    userId: user.id,
                    amount: verification.amountUSD,
                    type: 'deposit',
                    status: 'completed',
                    txHash: txId,
                    timestamp: Date.now()
                });

                await updateUser(user.id, { balance: user.balance });
                userStates.delete(ctx.from.id);
                await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `✅ Payment Verified!\n\n$${verification.amountUSD.toFixed(2)} added to your wallet (USDT equivalent).\nNew Balance: $${user.balance.toFixed(2)}`);

                // Referral Commission
                if (user.referredBy) {
                    const referrer = await getUser(user.referredBy);
                    if (referrer) {
                        const commission = 0.10;
                        referrer.balance += commission;
                        referrer.totalAffiliateEarnings = (referrer.totalAffiliateEarnings || 0) + commission;
                        await updateUser(referrer.id, { 
                            balance: referrer.balance, 
                            totalAffiliateEarnings: referrer.totalAffiliateEarnings 
                        });
                        try {
                            await bot.telegram.sendMessage(user.referredBy, `💰 <b>Referral Commission Received!</b>\n\nYour referral @${ctx.from.username || "SafeUser"} made a deposit. You have been credited with $${commission.toFixed(2)}!`);
                        } catch (e) {}
                    }
                }
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ <b>Verification Failed.</b>\n\n${verification.error}\n\nSupport: @SmarterKeysDaily`, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback("⬅️ Return To Main Menu", "main_menu")]
                    ])
                });
            }
        } catch (err) {
            console.error("TX Verification Error:", err);
            await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, "⚠️ <b>Verification Error.</b>\n\nPlease try again later or contact support: @SmarterKeysDaily", {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("⬅️ Return To Main Menu", "main_menu")]
                ])
            });
        }
        return;
    }

    if (state?.action === "ADMIN_WAITING_FOR_BROADCAST") {
        const broadcastMsg = ctx.message.text;
        const users = await getAllUsers();
        
        userStates.delete(ctx.from.id);
        await ctx.reply(`🚀 Starting broadcast to ${users.length} users...`);

        let successCount = 0;
        let failCount = 0;

        for (const user of users) {
            try {
                await ctx.telegram.sendMessage(user.id, `📢 <b>BROADCAST</b>\n\n${broadcastMsg}`, { parse_mode: 'HTML' });
                successCount++;
            } catch (err) {
                failCount++;
            }
        }

        return ctx.reply(`✅ Broadcast Finished!\n\n✅ Success: ${successCount}\n❌ Failed/Blocked: ${failCount}`);
    }

    if (state?.action === "ADMIN_APPROVE_CUSTOM_AMOUNT") {
        const amount = parseFloat(ctx.message.text);
        if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Invalid amount. Please enter a positive number.");
        
        const txId = state.data.txId;
        const transactions = await getAllTransactions();
        const tx = transactions.find((t: Transaction) => t.id === txId);
        if (!tx || tx.status !== 'pending') {
            userStates.delete(ctx.from.id);
            return ctx.reply("❌ Transaction not found or already processed.");
        }

        const targetUser = await getUser(tx.userId);
        if (!targetUser) {
            userStates.delete(ctx.from.id);
            return ctx.reply("❌ User not found.");
        }

        const newBalance = (targetUser.balance || 0) + amount;
        await updateUser(tx.userId, { balance: newBalance });
        await updateTransaction(txId, { status: 'completed', amount: amount });
        
        userStates.delete(ctx.from.id);

        ctx.replyWithHTML(`✅ <b>Approved Custom $${amount.toFixed(2)}</b> for User ID: <code>${tx.userId}</code>`);

        // Notify User
        try {
            await ctx.telegram.sendMessage(tx.userId, `✅ <b>Deposit Approved!</b>\n\n$${amount.toFixed(2)} has been added to your wallet.\nNew Balance: $${newBalance.toFixed(2)}`, { parse_mode: 'HTML' });
        } catch (e) {}
        return;
    }

    if (state?.action === "ADMIN_ADD_PRODUCT_NAME") {
        userStates.set(ctx.from.id, { action: "ADMIN_ADD_PRODUCT_PRICE", data: { name: ctx.message.text } });
        return ctx.reply("Enter product price (in USDT):");
    }

    if (state?.action === "ADMIN_ADD_PRODUCT_PRICE") {
        const price = parseFloat(ctx.message.text);
        if (isNaN(price)) return ctx.reply("Invalid price. Please enter a number.");
        state.data.price = price;
        userStates.set(ctx.from.id, { action: "ADMIN_ADD_PRODUCT_ACCOUNTS", data: state.data });
        return ctx.reply("Enter account details (one per line, format: email:pass):");
    }

    if (state?.action === "ADMIN_ADD_PRODUCT_ACCOUNTS") {
        const accounts = ctx.message.text.split("\n").filter(a => a.trim().length > 0);
        const product: Product = {
            id: Math.random().toString(36).substr(2, 9),
            name: state.data.name,
            price: state.data.price,
            category: "General",
            accounts: accounts,
            reviews: []
        };

        await saveProduct(product);
        userStates.delete(ctx.from.id);

        // Notify all users about the new product
        const notificationMsg = `🆕 <b>NEW PRODUCT ADDED!</b>\n\n🛍 <b>${product.name}</b>\n💰 Price: $${product.price}\n📦 Stock: ${product.accounts.length} units available!\n\nCheck it out in the 🛍 <b>Products</b> menu!`;
        notifyAllUsers(notificationMsg);

        return ctx.reply("✅ Product added successfully!", Markup.keyboard([["🛍 Products", "💰 Wallet"], ["📦 My Orders", "👤 Profile"], ["☎️ Support", "👥 Affiliate"], ["🔄 Update Bot"]]).resize());
    }

    // Admin Edit Logic
    if (state?.action.startsWith("ADMIN_EDIT_PRODUCT_")) {
        const productId = state.data.productId;
        const product = await getProduct(productId);
        if (!product) return ctx.reply("❌ Product not found.");

        let feedback = "✅ Successfully updated!";
        const updates: Partial<Product> = {};

        if (state.action === "ADMIN_EDIT_PRODUCT_NAME") {
            updates.name = ctx.message.text.trim();
        } else if (state.action === "ADMIN_EDIT_PRODUCT_PRICE") {
            const price = parseFloat(ctx.message.text);
            if (isNaN(price)) return ctx.reply("❌ Invalid price.");
            updates.price = price;
        } else if (state.action === "ADMIN_EDIT_PRODUCT_CAT") {
            updates.category = ctx.message.text.trim();
        } else if (state.action === "ADMIN_EDIT_PRODUCT_STOCK") {
            const accounts = ctx.message.text.split("\n").filter(a => a.trim().length > 0);
            const oldStock = product.accounts.length;
            updates.accounts = accounts;
            
            // Notify users if stock increased
            if (accounts.length > oldStock) {
                const notificationMsg = `🔄 <b>RESTOCK ALERT!</b>\n\n🛍 <b>${product.name}</b>\n📦 ${accounts.length} units added back in stock!\n\nGet yours now in 🛍 <b>Products</b>!`;
                notifyAllUsers(notificationMsg);
            }
        }

        await updateProduct(productId, updates);
        userStates.delete(ctx.from.id);
        
        return ctx.reply(feedback, Markup.inlineKeyboard([
            [Markup.button.callback("✏️ Continue Editing", `admin_edit_options_${productId}`)],
            [Markup.button.callback("🏛 Admin Panel", "admin_back")]
        ]));
    }
});

bot.action("admin_add_product", async (ctx) => {
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Invalid action.", { show_alert: true });

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    userStates.set(ctx.from!.id, { action: "ADMIN_ADD_PRODUCT_NAME" });
    return ctx.reply("Enter product name (e.g., YouTube Premium 1 Month):", Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Cancel & Main Menu", "main_menu")]
    ]));
});

bot.action("admin_view_tx", async (ctx) => {
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Invalid action.", { show_alert: true });

    const transactions = await getAllTransactions();
    let msg = "📊 Recent Transactions:\n\n";
    transactions.slice(0, 15).forEach((tx: Transaction) => {
        const tsDate = new Date(getTimestamp(tx.timestamp));
        msg += `🔹 ${tx.type.toUpperCase()} | User: ${tx.userId} | $${tx.amount.toFixed(2)} | ${tx.status}\nID: ${tx.id}\nTime: ${tsDate.toLocaleString()}\n\n`;
    });

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    return ctx.reply(msg, Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back to Admin Panel", "admin_back")],
        [Markup.button.callback("🏠 Main Menu", "main_menu")]
    ]));
});

bot.action("admin_broadcast", async (ctx) => {
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Invalid action.");

    userStates.set(ctx.from!.id, { action: "ADMIN_WAITING_FOR_BROADCAST" });
    return ctx.reply("📢 <b>Broadcast System</b>\n\nPlease enter the message you want to send to ALL users.\n\nType your message below:", { parse_mode: 'HTML' });
});

bot.action("admin_back", async (ctx) => {
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Invalid action.", { show_alert: true });

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    return ctx.reply("🛠 Admin Panel Options:", Markup.inlineKeyboard([
        [Markup.button.callback("🛍 Products", "admin_products_menu"), Markup.button.callback("📢 Broadcast", "admin_broadcast")],
        [Markup.button.callback("👥 Admins", "admin_manage_admins"), Markup.button.callback("💰 Balance", "admin_manage_balance")],
        [Markup.button.callback("📩 Messages", "admin_view_messages"), Markup.button.callback("📊 TXs", "admin_view_tx")],
        [Markup.button.callback("📈 Statistics", "admin_stats"), Markup.button.callback("🏠 Main Menu", "main_menu")]
    ]));
});

bot.action("admin_products_menu", async (ctx) => {
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Invalid action.");

    return ctx.editMessageText("🛍 <b>Product Management</b>", {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("➕ Add Product", "admin_add_product")],
            [Markup.button.callback("✏️ Edit Product", "admin_edit_product_list")],
            [Markup.button.callback("❌ Remove Product", "admin_remove_product")],
            [Markup.button.callback("⬅️ Back", "admin_back")]
        ])
    });
});

bot.action("admin_manage_admins", async (ctx) => {
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Invalid action.");

    return ctx.editMessageText("👥 <b>Admin Management</b>", {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("➕ Add Admin", "admin_req_add_id")],
            [Markup.button.callback("❌ Remove Admin", "admin_req_remove_id")],
            [Markup.button.callback("⬅️ Back", "admin_back")]
        ])
    });
});

bot.action("admin_manage_balance", async (ctx) => {
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Invalid action.");

    return ctx.editMessageText("💰 <b>Balance Management</b>", {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback("➕ Add Balance", "admin_bal_add_req")],
            [Markup.button.callback("➖ Remove Balance", "admin_bal_remove_req")],
            [Markup.button.callback("🧹 Empty Wallet", "admin_bal_empty_req")],
            [Markup.button.callback("⬅️ Back", "admin_back")]
        ])
    });
});

bot.action("admin_req_add_id", async (ctx) => {
    userStates.set(ctx.from!.id, { action: "ADMIN_WIZARD_ADD_ADMIN_ID" });
    await ctx.deleteMessage();
    return ctx.reply("🆔 <b>Enter the Telegram User ID you want to make ADMIN:</b>", { parse_mode: 'HTML', ...Markup.keyboard([["❌ Cancel Action"]]).resize() });
});

bot.action("admin_req_remove_id", async (ctx) => {
    userStates.set(ctx.from!.id, { action: "ADMIN_WIZARD_REMOVE_ADMIN_ID" });
    await ctx.deleteMessage();
    return ctx.reply("🆔 <b>Enter the Telegram User ID you want to REMOVE from Admins:</b>", { parse_mode: 'HTML', ...Markup.keyboard([["❌ Cancel Action"]]).resize() });
});

bot.action("admin_bal_add_req", async (ctx) => {
    userStates.set(ctx.from!.id, { action: "ADMIN_WIZARD_BAL_ADD_UID" });
    await ctx.deleteMessage();
    return ctx.reply("🆔 <b>Enter the Telegram User ID to ADD balance to:</b>", { parse_mode: 'HTML', ...Markup.keyboard([["❌ Cancel Action"]]).resize() });
});

bot.action("admin_bal_remove_req", async (ctx) => {
    userStates.set(ctx.from!.id, { action: "ADMIN_WIZARD_BAL_RM_UID" });
    await ctx.deleteMessage();
    return ctx.reply("🆔 <b>Enter the Telegram User ID to REMOVE balance from:</b>", { parse_mode: 'HTML', ...Markup.keyboard([["❌ Cancel Action"]]).resize() });
});

bot.action("admin_bal_empty_req", async (ctx) => {
    userStates.set(ctx.from!.id, { action: "ADMIN_WIZARD_BAL_EMPTY_UID" });
    await ctx.deleteMessage();
    return ctx.reply("🆔 <b>Enter the Telegram User ID to EMPTY their wallet:</b>", { parse_mode: 'HTML', ...Markup.keyboard([["❌ Cancel Action"]]).resize() });
});

bot.hears("❌ Cancel Action", async (ctx) => {
    userStates.delete(ctx.from.id);
    const user = await getUser(ctx.from.id.toString());
    return showMainMenu(ctx, user!);
});

bot.action("admin_edit_product_list", async (ctx) => {
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Access Denied.");

    const products = await getProducts();
    if (products.length === 0) return ctx.answerCbQuery("No products found.");

    const buttons = products.map((p: Product) => [Markup.button.callback(`✏️ ${p.name}`, `admin_edit_options_${p.id}`)]);
    buttons.push([Markup.button.callback("⬅️ Back", "admin_back")]);

    return ctx.editMessageText("Select a product to EDIT:", Markup.inlineKeyboard(buttons));
});

bot.action(/admin_edit_options_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const product = await getProduct(productId);
    if (!product) return ctx.answerCbQuery("Product not found.");

    const msg = `📝 <b>Editing: ${product.name}</b>\n\n` +
                `💰 Price: $${product.price.toFixed(2)}\n` +
                `📂 Category: ${product.category}\n` +
                `📦 Stock: ${product.accounts.length} units\n\n` +
                `Select what you want to change:`;

    const buttons = [
        [Markup.button.callback("🏷 Edit Name", `edit_prod_name_${productId}`)],
        [Markup.button.callback("💰 Edit Price", `edit_prod_price_${productId}`)],
        [Markup.button.callback("📂 Edit Category", `edit_prod_cat_${productId}`)],
        [Markup.button.callback("📦 Update Stock (Add/Remove)", `edit_prod_stock_${productId}`)],
        [Markup.button.callback("⬅️ Back", "admin_edit_product_list")]
    ];

    return ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
});

bot.action(/edit_prod_(name|price|cat|stock)_(.+)/, async (ctx) => {
    const field = ctx.match[1];
    const productId = ctx.match[2];
    
    let prompt = "";
    let stateAction = "";

    switch(field) {
        case "name": 
            prompt = "Enter new product name:";
            stateAction = "ADMIN_EDIT_PRODUCT_NAME";
            break;
        case "price":
            prompt = "Enter new product price ($):";
            stateAction = "ADMIN_EDIT_PRODUCT_PRICE";
            break;
        case "cat":
            prompt = "Enter new category name:";
            stateAction = "ADMIN_EDIT_PRODUCT_CAT";
            break;
        case "stock":
            prompt = "Enter new account details (one per line). This will REPLACED old stock.\nTo just add, copy old ones and add new.";
            stateAction = "ADMIN_EDIT_PRODUCT_STOCK";
            break;
    }

    userStates.set(ctx.from!.id, { action: stateAction, data: { productId } });
    
    try { await ctx.deleteMessage(); } catch (e) {}
    
    return ctx.reply(prompt, Markup.inlineKeyboard([[Markup.button.callback("❌ Cancel", "admin_back")]]));
});

bot.action("admin_stats", async (ctx) => {
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Invalid action.", { show_alert: true });

    const transactions = await getAllTransactions();
    const products = await getProducts();
    const users = await getAllUsers();

    const totalSales = transactions.filter((t: Transaction) => t.type === 'purchase').reduce((acc: number, t: Transaction) => acc + t.amount, 0);
    const totalDeposits = transactions.filter((t: Transaction) => t.type === 'deposit').reduce((acc: number, t: Transaction) => acc + t.amount, 0);
    const totalStock = products.reduce((acc: number, p: Product) => acc + p.accounts.length, 0);
    
    const msg = `📈 Statistics:\n\nTotal Users: ${users.length}\nTotal Products: ${products.length}\nTotal Units in Stock: ${totalStock}\nTotal Sales: $${totalSales.toFixed(2)}\nTotal Deposits: $${totalDeposits.toFixed(2)}`;
    
    try {
        await ctx.deleteMessage();
    } catch (e) {}

    return ctx.reply(msg, Markup.inlineKeyboard([
        [Markup.button.callback("⬅️ Back to Admin Panel", "admin_back")],
        [Markup.button.callback("🏠 Main Menu", "main_menu")]
    ]));
});

bot.action("admin_remove_product", async (ctx) => {
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Invalid action.", { show_alert: true });

    const products = await getProducts();

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    if (products.length === 0) return ctx.reply("No products to remove.", Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back", "admin_back")]]));

    const buttons = products.map((p: Product) => [Markup.button.callback(`Delete: ${p.name}`, `delete_prod_${p.id}`)]);
    buttons.push([Markup.button.callback("⬅️ Back to Admin Panel", "admin_back")]);
    return ctx.reply("Select a product to REMOVE permanently:", Markup.inlineKeyboard(buttons));
});

bot.action(/delete_prod_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const isAdmin = await isUserAdmin(ctx);
    if (!isAdmin) return ctx.answerCbQuery("❌ Invalid action.", { show_alert: true });

    const product = await getProduct(productId);
    if (!product) return ctx.answerCbQuery("Product not found.");

    await deleteProduct(productId);

    await ctx.answerCbQuery(`✅ ${product.name} Removed!`, { show_alert: true });
    return ctx.editMessageText(`✅ Product "${product.name}" has been removed from the store.`);
});

async function startServer() {
  console.log("Starting server setup...");

  // Health check and logging middleware
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  app.get("/health", (req, res) => {
    res.send("Server is running!");
  });

  app.post("/api/stripe-webhook", express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripe = getStripe();

    let event;

    try {
        if (endpointSecret && sig) {
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        } else {
            event = JSON.parse(req.body.toString());
        }
    } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata;

        if (metadata) {
            const userId = metadata.userId;
            const type = metadata.type;

            if (type === 'topup') {
                const amount = parseFloat(metadata.amount);
                const user = await getUser(userId);
                if (user) {
                    const newBal = (user.balance || 0) + amount;
                    await updateUser(userId, { balance: newBal });
                    await saveTransaction({
                        id: `stripe_${session.id}`,
                        userId,
                        amount,
                        type: 'deposit',
                        status: 'completed',
                        description: 'Stripe Top-up',
                        timestamp: new Date().toISOString()
                    });
                    try { await bot.telegram.sendMessage(userId, `✅ <b>Stripe Top-up Successful!</b>\n\n$${amount.toFixed(2)} has been added to your balance.`, { parse_mode: 'HTML' }); } catch (e) {}
                }
            } else if (type === 'purchase') {
                const productId = metadata.productId;
                const quantity = parseInt(metadata.quantity);
                const totalPrice = parseFloat(metadata.totalPrice);

                const product = await getProduct(productId);
                const user = await getUser(userId);

                if (product && user) {
                    if (product.accounts.length >= quantity) {
                        const accountsBought = product.accounts.splice(0, quantity);
                        const accountsText = accountsBought.join("\n");
                        const orderId = `stripe_order_${session.id}`;

                        await createOrder({
                            id: orderId,
                            userId: user.id,
                            productId: product.id,
                            productName: product.name,
                            accountDetail: accountsText,
                            amount: totalPrice,
                            timestamp: new Date().toISOString()
                        });

                        await saveTransaction({
                            id: `stripe_tx_${session.id}`,
                            userId: user.id,
                            amount: totalPrice,
                            type: 'purchase',
                            status: 'completed',
                            description: `Stripe purchase: ${product.name}`,
                            timestamp: new Date().toISOString()
                        });

                        await updateProduct(product.id, { accounts: product.accounts });
                        
                        let purchaseMsg = `✅ <b>Stripe Purchase Successful!</b>\n\nProduct: ${product.name}\nQuantity: ${quantity}\nTotal Amount: $${totalPrice.toFixed(2)}`;
                        purchaseMsg += `\n\n🔑 <b>Account Details:</b>\n<code>${accountsText}</code>\n\nEnjoy your service!`;

                        try { await bot.telegram.sendMessage(userId, purchaseMsg, { 
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback("⭐ Leave a Review", `leave_review_${product.id}`)],
                                [Markup.button.callback("🏠 Main Menu", "main_menu")]
                            ])
                        }); } catch (e) {}
                    } else {
                        // Refund needed or out of stock situation
                        console.error(`[STRIPE] Out of stock after payment for ${userId}, session ${session.id}`);
                        try { await bot.telegram.sendMessage(userId, `⚠️ <b>Payment Received but Out of Stock!</b>\n\nWe received your payment for ${product.name} (x${quantity}), but unfortunately, the item just went out of stock.\n\nPlease contact support @SmarterKeysDaily for a manual delivery or refund.\n\nTransaction ID: <code>${session.id}</code>`, { parse_mode: 'HTML' }); } catch (e) {}
                    }
                }
            }
        }
    }

    res.json({received: true});
  });
  
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      // Explicitly serve index.html for unknown routes in dev
      app.use('*', async (req, res, next) => {
        const url = req.originalUrl;
        try {
          let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).send(template);
        } catch (e) {
          vite.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
      console.log("Vite middleware and SPA fallback loaded");
    } catch (e) {
      console.error("Vite initialization failed:", e);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexHtml = path.join(distPath, 'index.html');
    
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send("Smart Keys Bot is running. (Frontend not built)");
      }
    });
  }

  // Global error handlers to prevent crashes
  process.on('uncaughtException', (err) => {
    console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL UNHANDLED REJECTION:', reason);
  });

    app.listen(PORT, "0.0.0.0", async () => {
        console.log(`Server running on http://localhost:${PORT}`);
        
        // Start bot whenever we have a token that isn't the default placeholder
        if (token && !token.includes("MY_TELEGRAM_BOT_TOKEN")) {
        console.log("Cleaning up webhook and launching Telegram bot in polling mode...");
        bot.telegram.deleteWebhook().then(() => {
            bot.launch({
                dropPendingUpdates: true 
            })
            .then(() => console.log("Bot started successfully!"))
            .catch((err) => {
                console.error("Bot launch failed:", err);
            });
        }).catch(err => {
            console.error("Failed to delete webhook:", err);
        });
    } else {
        console.warn("TELEGRAM_BOT_TOKEN is missing or is the default placeholder. Bot will not be launched.");
    }
  });
}

console.log("Entry point server.ts is being executed...");
startServer().catch(err => {
    console.error("FATAL ERROR DURING STARTUP:", err);
    process.exit(1);
});
