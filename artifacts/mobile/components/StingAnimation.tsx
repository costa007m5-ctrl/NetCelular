/**
 * StingAnimation — NETPLAY opening sting V18 Ultra Premium.
 *
 * Renderiza a vinheta HTML/CSS/SVG via WebView.
 * Interface: onEnd(), logoUrl (logo PNG transparente do título), title (fallback texto).
 *
 * A logo/título aparece centralizada no rodapé da animação
 * (abaixo de "CATÁLOGO PREMIUM"), exatamente onde o círculo azul foi marcado.
 */

import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";

let WebView: any = null;
try { WebView = require("react-native-webview").WebView; } catch {}

export const STING_DURATION_MS = 9_000;

interface StingAnimationProps {
  onEnd:    () => void;
  logoUrl?: string;
  title?:   string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildHtml(logoUrl?: string, title?: string): string {
  const safeTitle = esc(title ?? "");

  const contentBrand = `
<div class="content-brand">
  <div class="content-brand-glow"></div>
  ${logoUrl
    ? `<img src="${logoUrl}" class="content-logo-img" alt=""
            onerror="this.style.display='none';var f=document.getElementById('ctf');if(f)f.style.display='block'"/>`
    : ""}
  <div id="ctf" class="content-title-text" style="display:${logoUrl ? "none" : "block"}">${safeTitle}</div>
</div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"/>
<style>
:root{--d:9s;--red:#ff1830;--blue:#43b7ff;}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:100%;height:100%;overflow:hidden;background:#000;
  font-family:Inter,system-ui,-apple-system,sans-serif;color:#fff;}
body{display:grid;place-items:center;}
.stage{position:relative;width:min(100vw,177.78vh);height:min(100vh,56.25vw);
  min-width:320px;min-height:180px;overflow:hidden;isolation:isolate;
  background:
    radial-gradient(circle at 50% 44%,rgba(255,36,58,.18),transparent 25%),
    radial-gradient(circle at 50% 22%,rgba(60,165,255,.16),transparent 34%),
    linear-gradient(180deg,#000 0%,#05060b 42%,#090003 100%);}
.stage::before{content:"";position:absolute;inset:0;z-index:80;pointer-events:none;
  background:
    radial-gradient(circle at 50% 50%,transparent 0 43%,rgba(0,0,0,.50) 76%,rgba(0,0,0,.96) 100%),
    linear-gradient(90deg,rgba(0,0,0,.88),transparent 18% 82%,rgba(0,0,0,.88));}
.stage::after{content:"";position:absolute;inset:0;z-index:81;pointer-events:none;
  opacity:.035;background:repeating-linear-gradient(180deg,rgba(255,255,255,.08) 0,
  rgba(255,255,255,.08) 1px,transparent 1px,transparent 10px);
  animation:scan var(--d) linear infinite;}
.curtains{position:absolute;inset:-10%;z-index:1;opacity:0;
  background:linear-gradient(90deg,transparent 0%,rgba(255,24,48,.08) 12%,transparent 20%,
  rgba(255,24,48,.16) 33%,transparent 43%,rgba(255,24,48,.22) 50%,transparent 57%,
  rgba(255,24,48,.14) 70%,transparent 80%,rgba(255,24,48,.08) 90%,transparent 100%);
  filter:blur(12px);animation:curtains var(--d) ease-in-out infinite;}
.aurora{position:absolute;inset:-20%;z-index:2;opacity:0;
  background:conic-gradient(from 200deg at 50% 50%,transparent 0deg,rgba(255,24,48,.17) 65deg,
  transparent 128deg,rgba(65,180,255,.15) 210deg,transparent 292deg,rgba(255,24,48,.08) 340deg,
  transparent 360deg);filter:blur(44px);animation:aurora var(--d) ease-in-out infinite;}
.particles{position:absolute;inset:0;z-index:5;pointer-events:none;}
.particle{position:absolute;width:4px;height:4px;border-radius:999px;opacity:0;
  background:var(--blue);color:var(--blue);box-shadow:0 0 18px currentColor;
  animation:particle var(--d) ease-in-out infinite;}
.particle.red{background:var(--red);color:var(--red);}
.particle:nth-child(1){left:13%;top:42%;animation-delay:.10s;}
.particle:nth-child(2){left:23%;top:64%;animation-delay:.45s;}
.particle:nth-child(3){left:37%;top:30%;animation-delay:.18s;}
.particle:nth-child(4){left:51%;top:70%;animation-delay:.72s;}
.particle:nth-child(5){left:62%;top:34%;animation-delay:.36s;}
.particle:nth-child(6){left:76%;top:50%;animation-delay:.58s;}
.particle:nth-child(7){left:84%;top:62%;animation-delay:.96s;}
.particle:nth-child(8){left:88%;top:36%;animation-delay:.70s;}
.particle:nth-child(9){left:46%;top:48%;animation-delay:.25s;}
.particle:nth-child(10){left:56%;top:58%;animation-delay:.88s;}
.scene{position:absolute;inset:0;z-index:10;width:100%;height:100%;display:block;overflow:visible;}
.orbit-glow{opacity:0;animation:orbitGlow var(--d) ease-in-out infinite;}
.orbit-main{stroke-dasharray:1260;stroke-dashoffset:1260;
  animation:orbitDraw var(--d) cubic-bezier(.18,.85,.18,1) infinite;
  filter:drop-shadow(0 0 14px rgba(72,185,255,.72));}
.star{opacity:0;transform-origin:1572px 458px;animation:starPulse var(--d) ease-in-out infinite;
  filter:drop-shadow(0 0 24px rgba(190,245,255,.98));}
.star-core{transform-origin:1572px 458px;animation:starSpin var(--d) ease-in-out infinite;}
.horizon{stroke-dasharray:1140;stroke-dashoffset:1140;
  animation:horizonDraw var(--d) cubic-bezier(.2,.8,.2,1) infinite;
  filter:drop-shadow(0 0 16px rgba(255,24,44,.75));}
.scanner{opacity:0;animation:scannerMove var(--d) ease-in-out infinite;
  filter:drop-shadow(0 0 20px rgba(255,255,255,.9));}
.floor{opacity:0;animation:floorIn var(--d) ease-in-out infinite;}
.badge{transform-origin:960px 500px;opacity:0;
  animation:badgeEnter var(--d) cubic-bezier(.16,1,.3,1) infinite;
  filter:drop-shadow(0 22px 44px rgba(0,0,0,.70)) drop-shadow(0 0 26px rgba(255,24,48,.26));}
.badge-ring{transform-origin:960px 500px;opacity:0;animation:badgeRing var(--d) ease-out infinite;}
.glass-highlight{opacity:0;animation:glassSweep var(--d) ease-in-out infinite;}
.n-outline{fill:transparent;stroke:rgba(255,235,238,.96);stroke-width:7;
  stroke-dasharray:2050;stroke-dashoffset:2050;paint-order:stroke fill;
  animation:nOutlineDraw var(--d) cubic-bezier(.22,.9,.2,1) infinite;
  filter:drop-shadow(0 0 12px rgba(255,25,45,.70));}
.n-fill{opacity:0;animation:nFillFade var(--d) ease-in-out infinite;}
.n-depth{opacity:0;animation:nDepthIn var(--d) ease-in-out infinite;}
.n-energy{opacity:0;stroke-dasharray:460;stroke-dashoffset:460;
  animation:nEnergy var(--d) cubic-bezier(.18,.85,.2,1) infinite;
  filter:drop-shadow(0 0 12px rgba(255,65,85,.45));}
.n-play{opacity:0;transform-origin:1085px 584px;
  animation:playReveal var(--d) cubic-bezier(.2,.85,.2,1) infinite;}
.n-shine{opacity:0;animation:nShine var(--d) ease-in-out infinite;}
.fill-mask-rect{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(0);
  animation:fillUp var(--d) cubic-bezier(.2,.82,.2,1) infinite;}
.fragment{opacity:0;transform-origin:960px 500px;
  animation:fragmentPop var(--d) cubic-bezier(.2,.9,.2,1) infinite;}
.fragment.f1{animation-delay:.04s;}.fragment.f2{animation-delay:.13s;}
.fragment.f3{animation-delay:.22s;}.fragment.f4{animation-delay:.31s;}
.brand{opacity:0;transform-origin:960px 760px;
  animation:brandEnter var(--d) cubic-bezier(.2,.85,.2,1) infinite;
  filter:drop-shadow(0 10px 28px rgba(0,0,0,.65));}
.brand-glow{opacity:0;animation:brandGlow var(--d) ease-in-out infinite;}
.brand-line{opacity:0;stroke-dasharray:520;stroke-dashoffset:520;
  animation:brandLine var(--d) ease-in-out infinite;}
.brand-shine{opacity:0;animation:brandShine var(--d) ease-in-out infinite;}
.letter{opacity:0;transform-box:fill-box;transform-origin:center;
  animation:letterReveal var(--d) cubic-bezier(.2,.85,.2,1) infinite;}
.letter.l1{animation-delay:0s;}.letter.l2{animation-delay:.045s;}
.letter.l3{animation-delay:.09s;}.letter.l4{animation-delay:.135s;}
.letter.l5{animation-delay:.18s;}.letter.l6{animation-delay:.225s;}
.letter.l7{animation-delay:.27s;}
.subtitle{opacity:0;animation:subtitle var(--d) ease-in-out infinite;}
.micro-tag{opacity:0;animation:microTag var(--d) ease-in-out infinite;}
.final-flash{opacity:0;animation:finalFlash var(--d) ease-in-out infinite;}

/* ── Logo / título do conteúdo — centro inferior ── */
.content-brand{
  position:absolute;
  bottom:3.5%;
  left:50%;
  transform:translateX(-50%);
  z-index:90;
  opacity:0;
  text-align:center;
  pointer-events:none;
  animation:contentLogoIn var(--d) cubic-bezier(.2,.85,.2,1) forwards;
}
.content-logo-img{
  display:block;
  max-width:clamp(160px,42vw,440px);
  max-height:clamp(38px,8vh,88px);
  width:auto;
  height:auto;
  object-fit:contain;
  animation:logoGlowPulse 1.8s ease-in-out infinite;
}
.content-title-text{
  font-size:clamp(13px,2.6vw,28px);
  font-weight:700;
  letter-spacing:2.5px;
  color:rgba(255,255,255,.95);
  white-space:nowrap;
  text-transform:uppercase;
  animation:titleGlowPulse 1.8s ease-in-out infinite;
}
.content-brand-glow{
  position:absolute;
  inset:-18px -28px;
  border-radius:16px;
  animation:brandHaloPulse 1.8s ease-in-out infinite;
  pointer-events:none;
  z-index:-1;
}

@keyframes scan{to{transform:translateY(10px);}}
@keyframes curtains{
  0%,8%{opacity:0;transform:translateY(-20px) scaleX(1.08);}
  26%,84%{opacity:1;transform:translateY(0) scaleX(1);}
  100%{opacity:0;transform:translateY(18px) scaleX(1.04);}}
@keyframes aurora{
  0%,8%{opacity:0;transform:rotate(0deg) scale(.96);}
  34%,84%{opacity:1;transform:rotate(12deg) scale(1);}
  100%{opacity:0;transform:rotate(20deg) scale(1.08);}}
@keyframes particle{
  0%,12%{opacity:0;transform:translateY(18px) scale(.65);}
  30%,80%{opacity:.64;}
  100%{opacity:0;transform:translate(16px,-24px) scale(1.05);}}
@keyframes orbitDraw{
  0%,10%{opacity:0;stroke-dashoffset:1260;}20%{opacity:.72;}
  43%,84%{opacity:1;stroke-dashoffset:0;}100%{opacity:0;stroke-dashoffset:-1260;}}
@keyframes orbitGlow{0%,18%{opacity:0;}38%,80%{opacity:.24;}100%{opacity:0;}}
@keyframes starPulse{
  0%,34%{opacity:0;transform:scale(.55);}45%{opacity:1;transform:scale(1.14);}
  75%{opacity:.80;transform:scale(.96);}100%{opacity:0;transform:scale(.65);}}
@keyframes starSpin{
  0%,38%{transform:rotate(0deg) scale(.7);}52%{transform:rotate(18deg) scale(1);}
  74%{transform:rotate(0deg) scale(.95);}100%{transform:rotate(-8deg) scale(.72);}}
@keyframes horizonDraw{
  0%,25%{opacity:0;stroke-dashoffset:1140;}42%,84%{opacity:1;stroke-dashoffset:0;}
  100%{opacity:0;stroke-dashoffset:-1140;}}
@keyframes scannerMove{
  0%,43%{opacity:0;transform:translateX(-480px);}52%{opacity:.85;}
  65%,100%{opacity:0;transform:translateX(480px);}}
@keyframes floorIn{
  0%,49%{opacity:0;transform:translateY(8px);}64%,84%{opacity:.24;transform:translateY(0);}
  100%{opacity:0;transform:translateY(8px);}}
@keyframes badgeEnter{
  0%,22%{opacity:0;transform:translateY(-30px) scale(.74);}
  37%{opacity:1;transform:translateY(0) scale(1.035);}
  50%,84%{opacity:1;transform:translateY(0) scale(1);}
  100%{opacity:0;transform:translateY(14px) scale(.96);}}
@keyframes badgeRing{
  0%,34%{opacity:0;transform:scale(.68);}49%{opacity:.55;transform:scale(.94);}
  66%,100%{opacity:0;transform:scale(1.24);}}
@keyframes glassSweep{
  0%,52%{opacity:0;transform:translateX(-180px);}61%{opacity:.55;}
  72%,100%{opacity:0;transform:translateX(180px);}}
@keyframes nOutlineDraw{
  0%,20%{opacity:0;stroke-dashoffset:2050;}26%{opacity:1;}
  43%,84%{opacity:.95;stroke-dashoffset:0;}100%{opacity:0;stroke-dashoffset:-2050;}}
@keyframes fillUp{0%,31%{transform:scaleY(0);}51%,100%{transform:scaleY(1);}}
@keyframes nFillFade{0%,30%{opacity:0;}40%,84%{opacity:1;}100%{opacity:0;}}
@keyframes nDepthIn{0%,39%{opacity:0;}49%,84%{opacity:.32;}100%{opacity:0;}}
@keyframes nEnergy{
  0%,38%{opacity:0;stroke-dashoffset:460;}49%{opacity:.65;stroke-dashoffset:0;}
  58%{opacity:.22;stroke-dashoffset:-460;}100%{opacity:0;stroke-dashoffset:-460;}}
@keyframes playReveal{
  0%,49%{opacity:0;transform:scale(.3);}59%,84%{opacity:.70;transform:scale(1);}
  100%{opacity:0;transform:scale(.92);}}
@keyframes nShine{
  0%,55%{opacity:0;transform:translateX(-178px);}63%{opacity:.48;}
  73%,100%{opacity:0;transform:translateX(178px);}}
@keyframes fragmentPop{
  0%,27%{opacity:0;transform:translate(0,0) scale(.3) rotate(0deg);}
  40%{opacity:.70;transform:translate(var(--x),var(--y)) scale(1) rotate(var(--r));}
  59%,100%{opacity:0;transform:translate(calc(var(--x)*1.7),calc(var(--y)*1.7)) scale(.4) rotate(calc(var(--r)*2));}}
@keyframes brandEnter{
  0%,52%{opacity:0;transform:translateY(24px) scale(.97);}
  65%,84%{opacity:1;transform:translateY(0) scale(1);}
  100%{opacity:0;transform:translateY(12px) scale(.98);}}
@keyframes letterReveal{
  0%,56%{opacity:0;transform:translateY(22px) scale(.92);}
  67%,84%{opacity:1;transform:translateY(0) scale(1);}
  100%{opacity:0;transform:translateY(10px) scale(.98);}}
@keyframes brandGlow{
  0%,60%{opacity:0;}69%{opacity:.78;}78%{opacity:.32;}84%{opacity:.62;}100%{opacity:0;}}
@keyframes brandLine{
  0%,67%{opacity:0;stroke-dashoffset:520;}74%{opacity:1;stroke-dashoffset:0;}
  84%{opacity:.72;}100%{opacity:0;stroke-dashoffset:-520;}}
@keyframes brandShine{
  0%,68%{opacity:0;transform:translateX(-420px);}74%{opacity:.50;}
  83%,100%{opacity:0;transform:translateX(420px);}}
@keyframes subtitle{
  0%,62%{opacity:0;transform:translateY(10px);}71%,84%{opacity:.86;transform:translateY(0);}
  100%{opacity:0;transform:translateY(8px);}}
@keyframes microTag{
  0%,43%{opacity:0;transform:translateY(-8px);}56%,84%{opacity:.86;transform:translateY(0);}
  100%{opacity:0;transform:translateY(8px);}}
@keyframes finalFlash{0%,89%{opacity:0;}92%{opacity:.16;}100%{opacity:0;}}
/* Logo entra suave e FICA — não some durante a animação (forwards) */
@keyframes contentLogoIn{
  0%,62%{opacity:0;transform:translateX(-50%) translateY(12px);}
  72%,100%{opacity:1;transform:translateX(-50%) translateY(0);}}
/* Shimmer glow vermelho pulsante ao redor da logo PNG */
@keyframes logoGlowPulse{
  0%,100%{filter:drop-shadow(0 2px 14px rgba(0,0,0,.90)) drop-shadow(0 0 10px rgba(255,24,48,.40));}
  50%{filter:drop-shadow(0 2px 20px rgba(0,0,0,.95)) drop-shadow(0 0 28px rgba(255,24,48,.90)) drop-shadow(0 0 8px rgba(255,180,185,.50));}}
/* Shimmer glow para o texto do título */
@keyframes titleGlowPulse{
  0%,100%{text-shadow:0 2px 16px rgba(0,0,0,.95),0 0 16px rgba(255,24,48,.45);}
  50%{text-shadow:0 2px 20px rgba(0,0,0,.98),0 0 32px rgba(255,24,48,.95),0 0 6px rgba(255,180,185,.60);}}
/* Halo de luz vermelho atrás da logo */
@keyframes brandHaloPulse{
  0%,100%{background:radial-gradient(ellipse at center,rgba(255,24,48,.18) 0%,transparent 70%);box-shadow:none;}
  50%{background:radial-gradient(ellipse at center,rgba(255,24,48,.42) 0%,transparent 70%);box-shadow:0 0 40px 8px rgba(255,24,48,.22);}}
</style>
</head>
<body>
<main class="stage">
  <div class="curtains"></div>
  <div class="aurora"></div>
  <div class="particles">
    <span class="particle"></span><span class="particle red"></span>
    <span class="particle"></span><span class="particle red"></span>
    <span class="particle"></span><span class="particle red"></span>
    <span class="particle"></span><span class="particle red"></span>
    <span class="particle"></span><span class="particle red"></span>
  </div>

  <svg class="scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="orbitGradient" x1="260" y1="460" x2="1660" y2="460" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#2d95ff" stop-opacity="0"/><stop offset=".24" stop-color="#94e4ff"/>
        <stop offset=".66" stop-color="#3aa7ff"/><stop offset="1" stop-color="#efffff"/>
      </linearGradient>
      <linearGradient id="horizonGradient" x1="390" y1="602" x2="1530" y2="602" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ff1830" stop-opacity="0"/><stop offset=".18" stop-color="#ff1830"/>
        <stop offset=".50" stop-color="#ffffff"/><stop offset=".82" stop-color="#ff1830"/>
        <stop offset="1" stop-color="#ff1830" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="badgeFill" x1="778" y1="314" x2="1142" y2="690" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="rgba(255,255,255,.20)"/><stop offset=".35" stop-color="rgba(255,255,255,.055)"/>
        <stop offset="1" stop-color="rgba(255,24,48,.16)"/>
      </linearGradient>
      <linearGradient id="badgeStroke" x1="778" y1="314" x2="1142" y2="690" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="rgba(255,255,255,.45)"/><stop offset=".45" stop-color="rgba(255,35,55,.42)"/>
        <stop offset="1" stop-color="rgba(70,183,255,.30)"/>
      </linearGradient>
      <linearGradient id="nFill" x1="760" y1="300" x2="1160" y2="690" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ff7a82"/><stop offset=".22" stop-color="#ff2638"/>
        <stop offset=".57" stop-color="#d30015"/><stop offset="1" stop-color="#ff4355"/>
      </linearGradient>
      <linearGradient id="nStroke" x1="730" y1="320" x2="1210" y2="680" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ffd0d4" stop-opacity=".90"/><stop offset=".42" stop-color="#ff4b58" stop-opacity=".36"/>
        <stop offset="1" stop-color="#69000b" stop-opacity=".50"/>
      </linearGradient>
      <linearGradient id="titleRed" x1="535" y1="715" x2="895" y2="790" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ff5966"/><stop offset=".48" stop-color="#ff1b30"/>
        <stop offset="1" stop-color="#98000f"/>
      </linearGradient>
      <linearGradient id="titleSilver" x1="955" y1="715" x2="1415" y2="790" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ffffff"/><stop offset=".48" stop-color="#e3e6ee"/>
        <stop offset="1" stop-color="#7e858f"/>
      </linearGradient>
      <radialGradient id="mainGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#ff2336" stop-opacity=".46"/><stop offset=".46" stop-color="#ff2336" stop-opacity=".10"/>
        <stop offset="1" stop-color="#ff2336" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="brandGlowFill" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#ff3141" stop-opacity=".68"/><stop offset=".45" stop-color="#ff3141" stop-opacity=".15"/>
        <stop offset="1" stop-color="#ff3141" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="metal" x1="800" y1="314" x2="1120" y2="685" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="rgba(255,255,255,.36)"/><stop offset=".50" stop-color="rgba(255,255,255,.04)"/>
        <stop offset="1" stop-color="rgba(0,0,0,.42)"/>
      </linearGradient>
      <mask id="nFillMask">
        <rect x="0" y="0" width="1920" height="1080" fill="black"/>
        <rect class="fill-mask-rect" x="700" y="260" width="520" height="540" fill="white"/>
      </mask>
      <clipPath id="nClip">
        <text x="960" y="592" text-anchor="middle"
              font-family="Arial Black,Impact,Arial,sans-serif" font-size="370" font-weight="900">N</text>
      </clipPath>
      <clipPath id="titleClip">
        <text x="960" y="770" text-anchor="middle"
              font-family="Arial,sans-serif" font-size="104" font-weight="900" letter-spacing="8">NETPLAY</text>
      </clipPath>
      <filter id="premiumGlow" x="-45%" y="-45%" width="190%" height="190%">
        <feGaussianBlur stdDeviation="7" result="blur"/>
        <feColorMatrix in="blur" type="matrix"
          values="1 0 0 0 0.95 0 0.18 0 0 0 0 0 0.22 0 0.05 0 0 0 .70 0"/>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="glassSoft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.1"/>
      </filter>
    </defs>

    <circle cx="960" cy="520" r="340" fill="url(#mainGlow)" opacity=".78"/>
    <path class="orbit-glow" d="M300 496 C550 292,1060 238,1620 482"
          fill="none" stroke="#2d95ff" stroke-width="18" stroke-linecap="round"/>
    <path class="orbit-main" d="M300 496 C550 292,1060 238,1620 482"
          fill="none" stroke="url(#orbitGradient)" stroke-width="7" stroke-linecap="round"/>
    <g class="star">
      <g class="star-core">
        <path d="M1572 432 L1584 458 L1572 484 L1560 458 Z" fill="#ffffff"/>
        <path d="M1546 458 C1560 454,1566 447,1572 432 C1578 447,1584 454,1598 458 C1584 462,1578 469,1572 484 C1566 469,1560 462,1546 458 Z" fill="rgba(142,225,255,.55)"/>
        <circle cx="1572" cy="458" r="4.8" fill="#f4ffff"/>
      </g>
    </g>
    <path class="horizon" d="M390 602 L1530 602"
          fill="none" stroke="url(#horizonGradient)" stroke-width="5" stroke-linecap="round"/>
    <rect class="scanner" x="925" y="596" width="86" height="10" rx="5" fill="rgba(255,255,255,.42)"/>
    <g class="floor">
      <ellipse cx="960" cy="858" rx="415" ry="64" fill="rgba(255,20,40,.25)"/>
      <path d="M580 815 L1340 815" stroke="rgba(255,255,255,.14)" stroke-width="2"/>
      <path d="M700 860 L1220 860" stroke="rgba(255,255,255,.085)" stroke-width="2"/>
    </g>
    <g>
      <rect class="fragment f1" style="--x:-115px;--y:-45px;--r:-22deg;"
            x="930" y="482" width="21" height="72" rx="10" fill="#ff4352"/>
      <rect class="fragment f2" style="--x:112px;--y:-40px;--r:20deg;"
            x="966" y="488" width="21" height="72" rx="10" fill="#ff182c"/>
      <rect class="fragment f3" style="--x:-88px;--y:76px;--r:24deg;"
            x="950" y="526" width="82" height="16" rx="8" fill="#ff7b82"/>
      <rect class="fragment f4" style="--x:92px;--y:72px;--r:-24deg;"
            x="905" y="520" width="82" height="16" rx="8" fill="#ff2336"/>
    </g>
    <g class="badge">
      <ellipse class="badge-ring" cx="960" cy="500" rx="300" ry="178"
               fill="none" stroke="rgba(255,35,58,.58)" stroke-width="4"/>
      <rect x="790" y="322" width="340" height="340" rx="84"
            fill="url(#badgeFill)" stroke="url(#badgeStroke)" stroke-width="3" filter="url(#glassSoft)"/>
      <rect x="815" y="347" width="290" height="290" rx="70"
            fill="rgba(0,0,0,.34)" stroke="rgba(255,255,255,.10)" stroke-width="2"/>
      <rect class="glass-highlight" x="806" y="332" width="78" height="320" rx="40"
            fill="rgba(255,255,255,.11)" transform="rotate(-18 845 492)"/>
      <path d="M830 390 C900 340,1020 340,1090 400"
            fill="none" stroke="rgba(255,255,255,.12)" stroke-width="8" stroke-linecap="round"/>
      <text class="n-outline" x="960" y="592" text-anchor="middle"
            font-family="Arial Black,Impact,Arial,sans-serif" font-size="370" font-weight="900">N</text>
      <text class="n-fill" x="960" y="592" text-anchor="middle"
            font-family="Arial Black,Impact,Arial,sans-serif" font-size="370" font-weight="900"
            fill="url(#nFill)" stroke="url(#nStroke)" stroke-width="7"
            paint-order="stroke fill" mask="url(#nFillMask)" filter="url(#premiumGlow)">N</text>
      <g class="n-depth" clip-path="url(#nClip)">
        <path d="M805 300 L1172 690" stroke="rgba(255,255,255,.40)" stroke-width="40"/>
        <path d="M1006 290 L1250 704" stroke="rgba(0,0,0,.38)" stroke-width="82"/>
        <rect x="745" y="292" width="440" height="440" fill="url(#metal)" opacity=".42"/>
      </g>
      <path class="n-energy" d="M862 378 C935 450,1006 520,1080 606"
            fill="none" stroke="rgba(255,92,105,.72)" stroke-width="5" stroke-linecap="round"
            clip-path="url(#nClip)"/>
      <path class="n-play" d="M1032 521 L1118 580 L1032 636 Z" fill="rgba(9,0,3,.70)"/>
      <rect class="n-shine" x="715" y="285" width="110" height="490" rx="24"
            fill="rgba(255,255,255,.34)" transform="rotate(-16 770 545)" clip-path="url(#nClip)"/>
    </g>
    <g class="brand">
      <ellipse class="brand-glow" cx="960" cy="756" rx="400" ry="62" fill="url(#brandGlowFill)"/>
      <g font-family="Arial,sans-serif" font-size="104" font-weight="900" letter-spacing="8" text-anchor="middle">
        <text class="letter l1" x="620" y="770" fill="url(#titleRed)">N</text>
        <text class="letter l2" x="710" y="770" fill="url(#titleRed)">E</text>
        <text class="letter l3" x="800" y="770" fill="url(#titleRed)">T</text>
        <text class="letter l4" x="910" y="770" fill="url(#titleSilver)">P</text>
        <text class="letter l5" x="1010" y="770" fill="url(#titleSilver)">L</text>
        <text class="letter l6" x="1110" y="770" fill="url(#titleSilver)">A</text>
        <text class="letter l7" x="1220" y="770" fill="url(#titleSilver)">Y</text>
      </g>
      <rect class="brand-shine" x="500" y="680" width="120" height="130" rx="18"
            fill="rgba(255,255,255,.50)" transform="rotate(-14 560 745)" clip-path="url(#titleClip)"/>
      <path class="brand-line" d="M715 797 Q960 812 1205 797"
            fill="none" stroke="rgba(255,40,58,.84)" stroke-width="4" stroke-linecap="round"/>
      <g opacity=".10" transform="translate(0 837) scale(1 -.25)">
        <text x="960" y="0" text-anchor="middle" font-family="Arial,sans-serif"
              font-size="104" font-weight="900" letter-spacing="8">
          <tspan fill="#ff2738">NET</tspan><tspan fill="#ffffff">PLAY</tspan>
        </text>
      </g>
    </g>
    <text class="subtitle" x="960" y="842" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="23" font-weight="600"
          letter-spacing="8" fill="rgba(255,255,255,.84)">CATÁLOGO PREMIUM • ENTRETENIMENTO</text>
    <g class="micro-tag">
      <rect x="800" y="205" width="320" height="42" rx="21"
            fill="rgba(0,0,0,.36)" stroke="rgba(255,255,255,.12)"/>
      <text x="960" y="232" text-anchor="middle" font-family="Arial,sans-serif"
            font-size="15" font-weight="800" letter-spacing="5" fill="rgba(255,255,255,.76)">NETPLAY ORIGINAL</text>
    </g>
    <rect class="final-flash" x="0" y="0" width="1920" height="1080" fill="#ffffff"/>
  </svg>

  ${contentBrand}
</main>

<script>
(function(){
  try{
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    var master=ctx.createGain();
    master.gain.setValueAtTime(0,ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.65,ctx.currentTime+0.3);
    master.gain.setValueAtTime(0.65,ctx.currentTime+5.5);
    master.gain.linearRampToValueAtTime(0,ctx.currentTime+9);
    master.connect(ctx.destination);
    var reverb=ctx.createConvolver();
    var rb=ctx.createBuffer(2,ctx.sampleRate*2.5,ctx.sampleRate);
    for(var c=0;c<2;c++){var d=rb.getChannelData(c);for(var i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2.2);}
    reverb.buffer=rb;reverb.connect(master);
    var dry=ctx.createGain();dry.gain.value=0.55;dry.connect(master);
    function tone(f,s,dur,vol,type){
      var o=ctx.createOscillator(),g=ctx.createGain();
      o.type=type||'sine';o.frequency.setValueAtTime(f,ctx.currentTime+s);
      g.gain.setValueAtTime(0,ctx.currentTime+s);
      g.gain.linearRampToValueAtTime(vol,ctx.currentTime+s+0.07);
      g.gain.setValueAtTime(vol,ctx.currentTime+s+dur-0.12);
      g.gain.linearRampToValueAtTime(0,ctx.currentTime+s+dur);
      o.connect(g);g.connect(reverb);g.connect(dry);
      o.start(ctx.currentTime+s);o.stop(ctx.currentTime+s+dur+0.02);}
    function boom(s,vol){
      var buf=ctx.createBuffer(1,ctx.sampleRate*1.2,ctx.sampleRate);
      var bd=buf.getChannelData(0);
      for(var i=0;i<bd.length;i++)bd[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*0.18));
      var src=ctx.createBufferSource();src.buffer=buf;
      var g=ctx.createGain();g.gain.setValueAtTime(vol||0.9,ctx.currentTime+s);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+s+1.1);
      src.connect(g);g.connect(reverb);g.connect(dry);src.start(ctx.currentTime+s);}
    function riser(s){
      var o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
      f.type='lowpass';o.type='sawtooth';
      o.frequency.setValueAtTime(60,ctx.currentTime+s);
      o.frequency.exponentialRampToValueAtTime(480,ctx.currentTime+s+2.8);
      f.frequency.setValueAtTime(200,ctx.currentTime+s);
      f.frequency.exponentialRampToValueAtTime(4000,ctx.currentTime+s+2.8);
      g.gain.setValueAtTime(0,ctx.currentTime+s);
      g.gain.linearRampToValueAtTime(0.22,ctx.currentTime+s+0.5);
      g.gain.linearRampToValueAtTime(0,ctx.currentTime+s+2.8);
      o.connect(f);f.connect(g);g.connect(reverb);
      o.start(ctx.currentTime+s);o.stop(ctx.currentTime+s+3);}
    boom(0.0,0.85);riser(0.2);
    tone(110,0.8,1.2,0.28,'triangle');tone(220,1.4,0.9,0.22);
    boom(2.2,0.65);tone(330,2.5,0.7,0.20);tone(440,3.0,0.6,0.18);
    tone(550,3.5,0.5,0.16);tone(660,4.0,0.4,0.14);
    boom(4.8,0.75);tone(880,5.0,1.6,0.30);tone(1100,5.5,1.2,0.18);
    tone(440,6.5,2.0,0.22,'triangle');boom(7.5,0.55);
  }catch(e){}
})();
setTimeout(function(){
  if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('STING_DONE');
},9000);
</script>
</body>
</html>`;
}

export default function StingAnimation({ onEnd, logoUrl, title }: StingAnimationProps) {
  const onEndRef = useRef(onEnd);
  useEffect(() => { onEndRef.current = onEnd; });

  useEffect(() => {
    const t = setTimeout(() => onEndRef.current(), 13_000);
    return () => clearTimeout(t);
  }, []);

  if (!WebView) {
    return <View style={StyleSheet.absoluteFill} />;
  }

  if (Platform.OS === "web") {
    const html = buildHtml(logoUrl, title);
    return (
      <View style={StyleSheet.absoluteFill}>
        <iframe
          srcDoc={html}
          style={{ width: "100%", height: "100%", border: "none", background: "#000" }}
          sandbox="allow-scripts"
          title="Netplay Sting"
          onLoad={() => { setTimeout(() => onEndRef.current(), STING_DURATION_MS); }}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        source={{ html: buildHtml(logoUrl, title) }}
        style={{ flex: 1, backgroundColor: "#000" }}
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        onMessage={(event: any) => {
          if (event.nativeEvent.data === "STING_DONE") onEndRef.current();
        }}
      />
    </View>
  );
}
