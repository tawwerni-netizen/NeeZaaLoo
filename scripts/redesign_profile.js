const fs = require('fs');

const css = `
.wrap {
  min-height: 100vh;
  padding: 40px 20px;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding-top: 40px;
}

.heroSection {
  position: relative;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 40px;
  display: flex;
  align-items: center;
  gap: 40px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255,255,255,0.05);
  backdrop-filter: blur(20px);
  overflow: hidden;
}

.heroSection::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 100%;
  background: url('/images/banners/banner-certified-skill.jpg') center/cover;
  opacity: 0.15;
  z-index: 0;
}

.heroContent {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 40px;
  width: 100%;
}

.avatarWrapper {
  position: relative;
  flex-shrink: 0;
  border-radius: 50%;
  padding: 6px;
  background: linear-gradient(135deg, #38bdf8, #818cf8, #34d399);
  box-shadow: 0 0 30px rgba(56, 189, 248, 0.4);
}

.editAvatarBtn {
  position: absolute;
  bottom: 0; right: 0;
  background: #38bdf8;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  transition: transform 0.2s;
}
.editAvatarBtn:hover { transform: scale(1.1); background: #0ea5e9; }

.identityDetails {
  flex: 1;
}

.nickname {
  font-size: 42px;
  font-weight: 900;
  color: #fff;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
  text-shadow: 0 4px 12px rgba(0,0,0,0.5);
}

.levelBadge {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  font-size: 14px;
  padding: 4px 12px;
  border-radius: 20px;
  font-weight: 800;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
}

.expContainer {
  margin-top: 16px;
  max-width: 400px;
}

.expLabels {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 8px;
  font-weight: 600;
}

.expBar {
  height: 8px;
  background: rgba(255,255,255,0.1);
  border-radius: 4px;
  overflow: hidden;
}

.expBarFill {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.8);
}

.heroActions {
  margin-left: auto;
  z-index: 1;
}
[dir="rtl"] .heroActions { margin-left: 0; margin-right: auto; }

.editButton {
  padding: 12px 24px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  color: #fff;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(10px);
}
.editButton:hover {
  background: rgba(255,255,255,0.2);
  transform: translateY(-2px);
}

.mainGrid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 32px;
}

.glassCard {
  background: var(--nz-bg-1);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 24px;
  padding: 32px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2);
}

.cardHeader {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  gap: 12px;
}

.bioText {
  color: #cbd5e1;
  line-height: 1.8;
  font-size: 15px;
}

.statGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.statBox {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  transition: transform 0.2s;
}
.statBox:hover {
  transform: translateY(-3px);
  background: rgba(30, 41, 59, 0.8);
  border-color: rgba(56, 189, 248, 0.3);
}

.statValue {
  font-size: 32px;
  font-weight: 900;
  color: #fff;
  margin-bottom: 8px;
  text-shadow: 0 2px 10px rgba(255,255,255,0.1);
}
.statLabel {
  font-size: 13px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}

.ratingsList {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ratingItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 16px;
  transition: all 0.2s;
}
.ratingItem:hover {
  background: rgba(30, 41, 59, 0.8);
  transform: translateX(5px);
  border-color: rgba(56, 189, 248, 0.3);
}
[dir="rtl"] .ratingItem:hover {
  transform: translateX(-5px);
}

.ratingInfo {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ratingGameName {
  font-weight: 700;
  color: #fff;
  font-size: 16px;
}

.masteryPill {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 8px;
  font-weight: 800;
  letter-spacing: 0.05em;
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  text-transform: uppercase;
}

.ratingValues {
  text-align: right;
}
[dir="rtl"] .ratingValues { text-align: left; }

.currentRating {
  font-size: 24px;
  font-weight: 900;
  color: #38bdf8;
}

.peakRating {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

@media (max-width: 900px) {
  .heroContent { flex-direction: column; text-align: center; gap: 24px; }
  .heroActions { margin: 0 auto; }
  .mainGrid { grid-template-columns: 1fr; }
  .nickname { justify-content: center; flex-wrap: wrap; }
  .expContainer { margin: 16px auto 0; }
}
`;

fs.writeFileSync('apps/web/src/app/[locale]/profile/profile.module.css', css);
