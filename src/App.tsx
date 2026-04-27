/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { ShoppingCart, ShieldCheck, Zap, Globe, MessageSquare, ArrowRight, CreditCard, Sparkles, Lock, Cpu } from 'lucide-react';

export default function App() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-[#F27D26] selection:text-white scroll-smooth selection:bg-opacity-30">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#F27D26]/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      {/* Header */}
      <nav className="fixed top-0 w-full z-50 bg-black/40 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-[#F27D26] to-[#ff9b4f] rounded-xl flex items-center justify-center shadow-[0_0_25px_rgba(242,125,38,0.4)]">
              <ShoppingCart className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <span className="text-2xl font-black tracking-tighter uppercase whitespace-nowrap">SMART <span className="text-[#F27D26]">KEYS</span></span>
          </motion.div>
          
          <div className="hidden md:flex items-center gap-10 text-[11px] font-black uppercase tracking-[0.25em] text-white/40">
            <a href="#features" className="hover:text-white transition-all hover:tracking-[0.35em] duration-300">Features</a>
            <a href="#affiliate" className="hover:text-white transition-all hover:tracking-[0.35em] duration-300">Affiliate</a>
            <a href="#reviews" className="hover:text-white transition-all hover:tracking-[0.35em] duration-300">Reviews</a>
            <motion.a 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href="https://t.me/SHOP25s_Bot" 
              className="px-7 py-3 bg-white text-black rounded-xl hover:bg-[#F27D26] hover:text-white transition-all duration-500 shadow-xl font-bold"
            >
              Launch Bot
            </motion.a>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative pt-60 pb-40 overflow-hidden px-6">
          <div className="max-w-7xl mx-auto text-center relative z-10">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={containerVariants}
            >
              <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-4 py-2 border border-white/10 rounded-full bg-white/5 backdrop-blur-md mb-10">
                <Sparkles className="w-4 h-4 text-[#F27D26]" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">The Next Gen Account Store</span>
              </motion.div>
              
              <motion.h1 variants={itemVariants} className="text-7xl md:text-[140px] font-black uppercase leading-[0.75] tracking-[-0.05em] mb-12">
                Pure <br /> Digital <br /> <span className="text-[#F27D26] drop-shadow-[0_0_50px_rgba(242,125,38,0.3)]">Power.</span>
              </motion.h1>
              
              <motion.p variants={itemVariants} className="text-xl md:text-2xl text-white/50 max-w-3xl mx-auto mb-16 leading-relaxed font-medium">
                The fastest automated system for premium OTT accounts. 
                Zero wait time, blockchain security, and 24/7 dedicated performance.
              </motion.p>
              
              <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-8">
                <a 
                  href="https://t.me/SmartKeysDaily" 
                  className="group relative px-12 py-6 bg-[#F27D26] text-black font-black uppercase tracking-tighter rounded-2xl overflow-hidden hover:scale-105 transition-all duration-500 shadow-[0_30px_60px_rgba(242,125,38,0.3)]"
                >
                  <span className="relative z-10 flex items-center gap-4 text-xl">
                    Get Started <ArrowRight className="w-7 h-7 group-hover:translate-x-3 transition-transform duration-500" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                </a>
                <a href="#features" className="px-12 py-6 bg-white/5 border border-white/10 rounded-2xl font-black uppercase tracking-tighter hover:bg-white/10 transition-all backdrop-blur-xl text-xl hover:border-white/20">
                  Explore Tech
                </a>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-40 relative">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { 
                  icon: Zap, 
                  title: "Instant Active", 
                  desc: "Our high-speed node infrastructure ensures your keys are delivered the millisecond your payment hits 1 confirmation."
                },
                { 
                  icon: Lock, 
                  title: "Direct Crypto", 
                  desc: "No middlemen. No bank holds. Direct BTC and LTC gateway verification for absolute privacy and speed."
                },
                { 
                  icon: Cpu, 
                  title: "Smart Logic", 
                  desc: "Automated account rotation and validity checks mean you never receive a dead account. Quality, guaranteed."
                }
              ].map((feature, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className="bg-white/[0.03] border border-white/10 p-14 rounded-[3rem] flex flex-col gap-10 hover:bg-white/[0.05] hover:border-[#F27D26]/30 transition-all duration-700 group backdrop-blur-3xl"
                >
                  <div className="w-20 h-20 bg-gradient-to-br from-[#F27D26]/20 to-[#F27D26]/5 rounded-[2rem] flex items-center justify-center group-hover:rotate-12 transition-transform duration-500">
                    <feature.icon className="w-10 h-10 text-[#F27D26]" />
                  </div>
                  <div>
                    <h3 className="text-4xl font-black uppercase tracking-tighter mb-6 group-hover:text-[#F27D26] transition-colors">{feature.title}</h3>
                    <p className="text-white/40 leading-relaxed font-medium text-lg">
                      {feature.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Affiliate Section */}
        <section id="affiliate" className="py-40 relative border-t border-white/5 bg-zinc-950/30">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col lg:flex-row items-center gap-20">
              <div className="flex-1">
                <motion.div
                  initial={{ opacity: 0, x: -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                >
                  <h2 className="text-6xl md:text-8xl font-black uppercase tracking-tighter mb-8 italic">
                    Earn while <br /><span className="text-[#F27D26]">they spend.</span>
                  </h2>
                  <p className="text-white/40 text-xl font-medium max-w-lg mb-12 leading-relaxed">
                    Join the most rewarding partner network in the digital goods space. Our affiliate system is transparent, automated, and pays out instantly.
                  </p>
                  
                  <div className="space-y-6">
                    <div className="flex items-center gap-6 p-6 bg-white/5 rounded-3xl border border-white/10 hover:border-[#F27D26]/50 transition-colors group">
                      <div className="w-16 h-16 bg-[#F27D26]/10 rounded-2xl flex items-center justify-center">
                        <ArrowRight className="w-8 h-8 text-[#F27D26] group-hover:translate-x-2 transition-transform" />
                      </div>
                      <div>
                        <h4 className="font-black uppercase tracking-tight text-xl">$0.10 Commission</h4>
                        <p className="text-white/30 text-sm">Earn on every deposit your referral makes.</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
              
              <div className="flex-1 w-full max-w-xl">
                <div className="bg-gradient-to-br from-[#111] to-black p-1 space-y-4 rounded-[3rem] border border-white/10">
                  <div className="bg-black p-10 rounded-[2.8rem] space-y-10">
                    <div className="space-y-2">
                       <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#F27D26]">Network Stats</span>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="p-6 bg-white/5 rounded-2xl">
                             <p className="text-3xl font-black">$4.2k+</p>
                             <p className="text-[9px] uppercase font-bold text-white/30">Total Paid Out</p>
                          </div>
                          <div className="p-6 bg-white/5 rounded-2xl">
                             <p className="text-3xl font-black">1.8k+</p>
                             <p className="text-[9px] uppercase font-bold text-white/10">Active Partners</p>
                          </div>
                       </div>
                    </div>
                    <div className="p-8 border-2 border-dashed border-white/5 rounded-3xl text-center">
                        <p className="text-white/20 text-xs font-black uppercase tracking-[0.2em] mb-4">Referral Link:</p>
                        <code className="text-[#F27D26] font-mono text-sm break-all">t.me/SmarterKeysDailyBot?start=YOUR_ID</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Reviews Section */}
        <section id="reviews" className="py-40 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-24">
              <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-6">User <span className="text-[#F27D26]">Feedback</span></h2>
              <p className="text-white/40 font-medium max-w-2xl mx-auto">See what our customers are saying about our premium digital assets and lighting fast delivery.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { name: "Alex K.", rating: 5, comment: "Literal seconds after I sent the LTC, I got my YouTube Premium. Smoothest bot I've used.", product: "YouTube Premium" },
                { name: "Satoshi_Fan", rating: 5, comment: "Affiliate system is goated. Referred 10 friends, already earned enough for a free Netflix sub.", product: "Affiliate Earnings" },
                { name: "DigitalNomad", rating: 4, comment: "Support responded in 5 mins when I had a question. Very reliable and the accounts work perfectly.", product: "ChatGPT Plus" }
              ].map((rev, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-zinc-950/50 border border-white/5 p-10 rounded-[2.5rem] hover:border-[#F27D26]/20 transition-all group"
                >
                  <div className="flex gap-1 mb-6">
                    {[...Array(rev.rating)].map((_, i) => (
                      <Sparkles key={i} className="w-4 h-4 text-[#F27D26]" />
                    ))}
                  </div>
                  <p className="text-lg font-medium text-white/70 mb-8 italic leading-relaxed">"{rev.comment}"</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black uppercase tracking-tight text-white">{rev.name}</p>
                      <p className="text-[10px] text-[#F27D26] font-black uppercase tracking-widest">{rev.product}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Payment Section */}
        <section id="payment" className="py-40 bg-zinc-950/50 border-y border-white/5 relative">
          <div className="max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-32">
            <div className="flex-1 text-center lg:text-left">
              <h2 className="text-7xl md:text-9xl font-black uppercase leading-[0.85] tracking-tighter mb-12">
                Ultra <br /> <span className="text-white/10 transition-colors duration-1000">Liquid Pay</span>
              </h2>
              <p className="text-white/40 mb-16 leading-relaxed font-medium text-xl max-w-xl mx-auto lg:mx-0">
                Deposit instantly using BTC or LTC. Our system tracks the mempool in real-time to give you the fastest possible balance credit.
              </p>
              
              <div className="grid grid-cols-2 gap-8 max-w-sm mx-auto lg:mx-0">
                <div className="aspect-square flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-[2.5rem] backdrop-blur-xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#F27D26]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="text-5xl font-black mb-1 text-[#F27D26]">0%</span>
                  <span className="text-[10px] uppercase font-black tracking-widest text-white/30">Tax Fee</span>
                </div>
                <div className="aspect-square flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-[2.5rem] backdrop-blur-xl group">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#F27D26]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="text-5xl font-black mb-1 text-[#F27D26]">Instant</span>
                  <span className="text-[10px] uppercase font-black tracking-widest text-white/30">Auto Load</span>
                </div>
              </div>
            </div>
            
            <div className="flex-1 w-full max-w-xl">
              <motion.div 
                initial={{ rotateY: -10, rotateX: 5 }}
                whileInView={{ rotateY: 10, rotateX: -5 }}
                transition={{ duration: 4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                className="relative aspect-[1.58] bg-gradient-to-br from-[#F27D26] to-[#ffb37a] rounded-[3.5rem] p-12 flex flex-col justify-between shadow-[0_50px_100px_-20px_rgba(242,125,38,0.4)] border-[12px] border-white/10 overflow-hidden"
              >
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/20 rounded-full blur-3xl" />
                
                <div className="flex justify-between items-start relative z-10">
                  <div className="w-20 h-20 bg-black rounded-[2rem] flex items-center justify-center shadow-2xl">
                    <CreditCard className="w-10 h-10 text-[#F27D26]" />
                  </div>
                  <div className="text-right">
                    <span className="text-black font-black italic tracking-tighter text-4xl opacity-80 uppercase leading-none">VIRTUAL</span>
                    <p className="text-black/50 text-[10px] font-black tracking-[0.2em] mt-1 uppercase">Crypto Wallet</p>
                  </div>
                </div>
                
                <div className="space-y-6 relative z-10">
                  <div className="group cursor-pointer">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-black/50 text-[11px] font-black uppercase tracking-[0.4em]">BTC MAINNET</p>
                      <span className="text-[9px] bg-black text-white px-2 py-0.5 rounded-full font-black opacity-0 group-hover:opacity-100 transition-opacity">COPY</span>
                    </div>
                    <p className="text-black text-[15px] font-black tracking-tight break-all select-all bg-black/10 p-3 rounded-2xl hover:bg-black/20 transition-colors">bc1qynud2ydp9nnqklmu4hmv38nq92hkh9f7xhkv9s</p>
                  </div>
                  <div className="group cursor-pointer">
                     <div className="flex justify-between items-center mb-1">
                      <p className="text-black/50 text-[11px] font-black uppercase tracking-[0.4em]">LTC MAINNET</p>
                      <span className="text-[9px] bg-black text-white px-2 py-0.5 rounded-full font-black opacity-0 group-hover:opacity-100 transition-opacity">COPY</span>
                    </div>
                    <p className="text-black text-[15px] font-black tracking-tight break-all select-all bg-black/10 p-3 rounded-2xl hover:bg-black/20 transition-colors">ltc1qnmpx7q5qavj367ukzjmtece7vq2u0e49mc6uxx</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-black py-32 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-start gap-20">
            <div className="max-w-md">
              <div className="flex items-center gap-4 mb-10">
                <div className="w-10 h-10 bg-[#F27D26] rounded-xl flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5 text-black" />
                </div>
                <span className="text-3xl font-black uppercase tracking-tighter">SMART KEYS</span>
              </div>
              <p className="text-white/30 text-lg leading-relaxed mb-10 font-medium italic">
                The preferred choice for bulk and single account digital keys globally.
              </p>
              <div className="flex gap-4">
                 <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-[#F27D26] transition-colors"><Globe className="w-4 h-4" /></div>
                 <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-[#F27D26] transition-colors"><ShieldCheck className="w-4 h-4" /></div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-20">
              <div className="space-y-6">
                <h4 className="text-[#F27D26] font-black text-xs uppercase tracking-[0.3em]">Menu</h4>
                <ul className="space-y-4 text-white/40 font-black text-[11px] uppercase ml-1">
                  <li><a href="#" className="hover:text-white transition-colors">Products</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Balance</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
                </ul>
              </div>
              <div className="space-y-6">
                 <h4 className="text-[#F27D26] font-black text-xs uppercase tracking-[0.3em]">Help</h4>
                 <a 
                   href="https://t.me/SmarterKeysDaily" 
                   className="flex items-center gap-3 px-8 py-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-[#F27D26] hover:text-black transition-all group"
                 >
                   <MessageSquare className="w-5 h-5" />
                   <span className="text-xs font-black uppercase tracking-widest">Support</span>
                 </a>
              </div>
            </div>
          </div>
          <div className="mt-32 pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-white/10 text-[9px] font-black uppercase tracking-[0.4em]">
              © 2026 SMART KEYS HUB. ALL RIGHTS RESERVED.
            </p>
            <div className="flex gap-8 text-[9px] font-black uppercase tracking-[0.4em] text-white/10">
              <span className="hover:text-white/30 cursor-pointer transition-colors">Uptime: 99.9%</span>
              <span className="hover:text-white/30 cursor-pointer transition-colors">Status: Operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

