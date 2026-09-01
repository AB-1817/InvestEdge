# ═══════════════════════════════════════════════════════════════════════════════
# OPPORTUNITY RADAR - REAL DATA INTEGRATION MODULE
# ═══════════════════════════════════════════════════════════════════════════════

import httpx
import asyncio
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import re
from collections import defaultdict

# ─── NSE Session Manager ───────────────────────────────────────────────────────

class NSESession:
    """Manages NSE website session with proper headers to avoid blocking"""
    
    BASE_URL = "https://www.nseindia.com"
    
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Cache-Control": "max-age=0",
    }
    
    def __init__(self):
        self.session = None
        self.cookies = {}
    
    async def init_session(self):
        """Initialize session with NSE to get cookies"""
        if self.session is None:
            self.session = httpx.AsyncClient(headers=self.HEADERS, timeout=30.0, follow_redirects=True)
            try:
                # Visit homepage to get cookies
                response = await self.session.get(self.BASE_URL)
                self.cookies = dict(response.cookies)
            except Exception:
                pass
    
    async def get(self, url: str, params: dict = None) -> httpx.Response:
        """Make GET request with proper session"""
        await self.init_session()
        return await self.session.get(url, params=params, cookies=self.cookies)
    
    async def close(self):
        """Close session"""
        if self.session:
            await self.session.aclose()


# ─── 1. BULK/BLOCK DEALS SCANNER (REAL NSE DATA) ──────────────────────────────

async def fetch_bulk_deals() -> List[Dict]:
    """
    Fetch REAL bulk deals from NSE
    Source: https://www.nseindia.com/api/block-deal
    """
    opportunities = []
    nse = NSESession()
    
    try:
        await nse.init_session()
        
        # NSE Bulk Deals API
        bulk_deals_url = "https://www.nseindia.com/api/block-deal"
        
        try:
            response = await nse.get(bulk_deals_url)
            if response.status_code == 200:
                data = response.json()
                deals = data.get("data", [])
                
                for deal in deals[:10]:  # Top 10 recent deals
                    symbol = deal.get("symbol", "").replace("-EQ", "")
                    client_name = deal.get("clientName", "Unknown")
                    quantity = deal.get("quantity", 0)
                    price = deal.get("price", 0)
                    deal_type = deal.get("buySell", "")
                    
                    if not symbol:
                        continue
                    
                    # Calculate signal strength
                    is_buy = "buy" in deal_type.lower()
                    value_cr = (quantity * price) / 10000000  # Convert to Crores
                    
                    signal = "BUY" if is_buy else "WATCH"
                    confidence = min(95, int(60 + (value_cr * 2)))
                    
                    opportunities.append({
                        "type": "bulk_deal",
                        "symbol": symbol,
                        "title": f"{'Bulk Buy' if is_buy else 'Bulk Sell'}: {client_name}",
                        "description": f"{client_name} {'purchased' if is_buy else 'sold'} {quantity:,} shares at ₹{price:.2f}. Total value: ₹{value_cr:.1f} Cr. {'Institutional accumulation signals confidence.' if is_buy else 'Large selling may indicate profit booking.'}",
                        "value": value_cr,
                        "date": datetime.now().strftime("%Y-%m-%d"),
                        "signal": signal,
                        "confidence": confidence,
                        "category": "Bulk Deal",
                        "impact": "High" if value_cr > 100 else "Medium",
                        "score": 30 if is_buy else 10,
                        "details": {
                            "client": client_name,
                            "quantity": f"{quantity:,}",
                            "price": f"₹{price:.2f}",
                            "value": f"₹{value_cr:.1f} Cr",
                            "type": deal_type
                        }
                    })
        except Exception as e:
            print(f"Bulk deals fetch error: {e}")
    
    finally:
        await nse.close()
    
    return opportunities


# ─── 2. CORPORATE FILINGS SCANNER (REAL NSE DATA) ─────────────────────────────

async def fetch_corporate_filings() -> List[Dict]:
    """
    Fetch REAL corporate announcements from NSE
    Source: https://www.nseindia.com/api/corporate-announcements
    """
    opportunities = []
    nse = NSESession()
    
    try:
        await nse.init_session()
        
        # NSE Corporate Announcements API
        announcements_url = "https://www.nseindia.com/api/corporate-announcements"
        params = {"index": "equities"}
        
        try:
            response = await nse.get(announcements_url, params=params)
            if response.status_code == 200:
                data = response.json()
                announcements = data.get("data", [])
                
                # Keywords for important events
                buyback_keywords = ["buyback", "buy back", "buy-back"]
                bonus_keywords = ["bonus", "bonus issue"]
                dividend_keywords = ["dividend"]
                merger_keywords = ["merger", "acquisition", "amalgamation"]
                
                for announcement in announcements[:15]:
                    symbol = announcement.get("symbol", "").replace("-EQ", "")
                    subject = announcement.get("subject", "").lower()
                    desc = announcement.get("desc", "")
                    
                    if not symbol or not subject:
                        continue
                    
                    # Detect event type and score
                    score = 0
                    category = "Corporate Filing"
                    signal = "WATCH"
                    impact = "Medium"
                    
                    if any(kw in subject for kw in buyback_keywords):
                        score = 35
                        category = "Buyback"
                        signal = "BUY"
                        impact = "High"
                        title = "Buyback Program Announced"
                    elif any(kw in subject for kw in bonus_keywords):
                        score = 30
                        category = "Bonus Issue"
                        signal = "BUY"
                        impact = "High"
                        title = "Bonus Shares Announcement"
                    elif any(kw in subject for kw in dividend_keywords):
                        score = 20
                        category = "Dividend"
                        signal = "BUY"
                        impact = "Medium"
                        title = "Dividend Declared"
                    elif any(kw in subject for kw in merger_keywords):
                        score = 25
                        category = "M&A"
                        signal = "WATCH"
                        impact = "High"
                        title = "Merger/Acquisition Activity"
                    else:
                        continue  # Skip non-critical announcements
                    
                    opportunities.append({
                        "type": "filing",
                        "symbol": symbol,
                        "title": title,
                        "description": f"{desc[:200]}... Corporate action detected. {category} events typically drive significant price movements.",
                        "value": None,
                        "date": datetime.now().strftime("%Y-%m-%d"),
                        "signal": signal,
                        "confidence": min(90, 65 + score),
                        "category": category,
                        "impact": impact,
                        "score": score,
                        "details": {
                            "event_type": category,
                            "subject": subject[:100],
                            "source": "NSE Filing"
                        }
                    })
        except Exception as e:
            print(f"Corporate filings fetch error: {e}")
    
    finally:
        await nse.close()
    
    return opportunities


# ─── 3. EARNINGS CALENDAR & RESULTS (REAL DATA) ───────────────────────────────

async def fetch_earnings_events() -> List[Dict]:
    """
    Fetch real earnings data using yfinance + earnings calendar
    """
    opportunities = []
    
    # Top stocks to monitor
    stocks = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", 
              "WIPRO.NS", "BAJFINANCE.NS", "SBIN.NS", "LT.NS", "MARUTI.NS"]
    
    import yfinance as yf
    
    for symbol in stocks:
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            
            # Real earnings growth
            earnings_growth = info.get('earningsGrowth')
            revenue_growth = info.get('revenueGrowth')
            
            if earnings_growth and earnings_growth > 0.20:  # 20%+ growth
                score = int(20 + (earnings_growth * 50))
                
                opportunities.append({
                    "type": "results",
                    "symbol": symbol.replace(".NS", ""),
                    "title": "Strong Earnings Growth Detected",
                    "description": f"Earnings growing at {earnings_growth*100:.1f}% YoY. {f'Revenue: {revenue_growth*100:.1f}%.' if revenue_growth else ''} Exceptional operational performance indicates strong business momentum.",
                    "value": None,
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "signal": "STRONG BUY" if earnings_growth > 0.30 else "BUY",
                    "confidence": min(95, int(70 + earnings_growth * 80)),
                    "category": "Earnings Growth",
                    "impact": "High",
                    "score": score,
                    "details": {
                        "earnings_growth": f"{earnings_growth*100:.1f}%",
                        "revenue_growth": f"{revenue_growth*100:.1f}%" if revenue_growth else "N/A",
                        "source": "Yahoo Finance"
                    }
                })
            
            # Analyst upgrades with high upside
            recommendation = info.get('recommendationKey', '')
            target_price = info.get('targetMeanPrice')
            current_price = info.get('currentPrice')
            
            if recommendation in ['strong_buy', 'buy'] and target_price and current_price:
                upside = ((target_price - current_price) / current_price) * 100
                if upside > 20:
                    score = int(15 + (upside / 2))
                    
                    opportunities.append({
                        "type": "results",
                        "symbol": symbol.replace(".NS", ""),
                        "title": "High Analyst Upside Potential",
                        "description": f"Analysts project {upside:.1f}% upside to target of ₹{target_price:.0f}. Consensus: {recommendation.replace('_', ' ').title()}. Strong institutional conviction.",
                        "value": None,
                        "date": datetime.now().strftime("%Y-%m-%d"),
                        "signal": "BUY",
                        "confidence": min(90, int(65 + upside)),
                        "category": "Analyst Upgrade",
                        "impact": "High",
                        "score": score,
                        "details": {
                            "current_price": f"₹{current_price:.2f}",
                            "target_price": f"₹{target_price:.2f}",
                            "upside": f"{upside:.1f}%",
                            "recommendation": recommendation.replace('_', ' ').title()
                        }
                    })
        except Exception:
            continue
    
    return opportunities


# ─── 4. NEWS SENTIMENT ANALYSIS (REAL NLP) ────────────────────────────────────

async def fetch_news_sentiment() -> List[Dict]:
    """
    Real-time news sentiment analysis using Yahoo Finance news
    """
    opportunities = []
    
    stocks = ["RELIANCE.NS", "TATAMOTORS.NS", "MARUTI.NS", "INFY.NS", "TCS.NS"]
    
    positive_keywords = ['surge', 'growth', 'expansion', 'optimistic', 'strong', 'robust', 
                        'upgrade', 'positive', 'bullish', 'rally', 'gain', 'profit']
    negative_keywords = ['caution', 'concern', 'weak', 'decline', 'downgrade', 'risk',
                        'bearish', 'fall', 'loss', 'warning']
    
    import yfinance as yf
    
    for symbol in stocks:
        try:
            ticker = yf.Ticker(symbol)
            news = ticker.news or []
            
            sentiment_score = 0
            positive_count = 0
            negative_count = 0
            
            for article in news[:10]:
                content = article.get('content', {}) or {}
                title = (content.get('title') or article.get('title', '')).lower()
                
                pos = sum(1 for kw in positive_keywords if kw in title)
                neg = sum(1 for kw in negative_keywords if kw in title)
                
                positive_count += pos
                negative_count += neg
                sentiment_score += (pos - neg)
            
            if sentiment_score >= 3:  # Net positive sentiment
                score = 15
                
                opportunities.append({
                    "type": "commentary",
                    "symbol": symbol.replace(".NS", ""),
                    "title": "Positive News Sentiment Surge",
                    "description": f"Recent news shows strong positive sentiment ({positive_count} positive vs {negative_count} negative signals). Market narrative turning favorable.",
                    "value": None,
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "signal": "BUY",
                    "confidence": min(85, 60 + sentiment_score * 5),
                    "category": "News Sentiment",
                    "impact": "Medium",
                    "score": score,
                    "details": {
                        "sentiment": "Positive",
                        "positive_signals": str(positive_count),
                        "negative_signals": str(negative_count),
                        "net_score": str(sentiment_score)
                    }
                })
        except Exception:
            continue
    
    return opportunities


# ─── 5. SIGNAL SCORING ENGINE ─────────────────────────────────────────────────

def calculate_opportunity_score(opportunities: List[Dict]) -> List[Dict]:
    """
    Calculate final score and classify opportunities
    
    Scoring:
    - Bulk deal (buy): +30
    - Corporate action (buyback/bonus): +35
    - Earnings growth: +20
    - Analyst upgrade: +15
    - News sentiment: +15
    - Low debt: +10
    """
    
    # Group by symbol
    symbol_scores = defaultdict(lambda: {"score": 0, "signals": [], "confidence": 0})
    
    for opp in opportunities:
        symbol = opp["symbol"]
        score = opp.get("score", 0)
        
        symbol_scores[symbol]["score"] += score
        symbol_scores[symbol]["signals"].append(opp)
        symbol_scores[symbol]["confidence"] = max(
            symbol_scores[symbol]["confidence"], 
            opp.get("confidence", 0)
        )
    
    # Classify and enrich
    enriched = []
    for opp in opportunities:
        symbol = opp["symbol"]
        total_score = symbol_scores[symbol]["score"]
        
        # Classify
        if total_score >= 80:
            bucket = "VERY HOT 🔴"
            bucket_color = "#dc2626"
        elif total_score >= 60:
            bucket = "HOT 🟠"
            bucket_color = "#ea580c"
        elif total_score >= 40:
            bucket = "WARM 🟡"
            bucket_color = "#d97706"
        else:
            bucket = "COLD ⚪"
            bucket_color = "#9ca3af"
        
        opp["total_score"] = total_score
        opp["bucket"] = bucket
        opp["bucket_color"] = bucket_color
        enriched.append(opp)
    
    return enriched


# ─── 6. MAIN OPPORTUNITY RADAR FUNCTION ───────────────────────────────────────

async def scan_opportunities(filters: Optional[List[str]] = None) -> Dict:
    """
    Main function to scan all opportunity sources in parallel
    """
    
    # Fetch all data sources in parallel
    results = await asyncio.gather(
        fetch_bulk_deals(),
        fetch_corporate_filings(),
        fetch_earnings_events(),
        fetch_news_sentiment(),
        return_exceptions=True
    )
    
    # Combine all opportunities
    all_opportunities = []
    for result in results:
        if isinstance(result, list):
            all_opportunities.extend(result)
    
    # Apply filters
    if filters:
        all_opportunities = [o for o in all_opportunities if o["type"] in filters]
    
    # Calculate scores and classify
    all_opportunities = calculate_opportunity_score(all_opportunities)
    
    # Remove duplicates
    seen = set()
    unique_opportunities = []
    for opp in all_opportunities:
        key = f"{opp['symbol']}_{opp['title']}"
        if key not in seen:
            seen.add(key)
            unique_opportunities.append(opp)
    
    # Sort by total score
    unique_opportunities.sort(key=lambda x: x.get("total_score", 0), reverse=True)
    
    # Generate summary
    summary = {
        "total_opportunities": len(unique_opportunities),
        "very_hot": len([o for o in unique_opportunities if "VERY HOT" in o.get("bucket", "")]),
        "hot": len([o for o in unique_opportunities if o.get("bucket", "") == "HOT 🟠"]),
        "warm": len([o for o in unique_opportunities if o.get("bucket", "") == "WARM 🟡"]),
        "strong_buy_signals": len([o for o in unique_opportunities if o["signal"] == "STRONG BUY"]),
        "buy_signals": len([o for o in unique_opportunities if o["signal"] == "BUY"]),
        "avg_confidence": round(sum(o["confidence"] for o in unique_opportunities) / len(unique_opportunities), 1) if unique_opportunities else 0,
        "avg_score": round(sum(o.get("total_score", 0) for o in unique_opportunities) / len(unique_opportunities), 1) if unique_opportunities else 0,
    }
    
    return {
        "opportunities": unique_opportunities[:25],  # Top 25
        "summary": summary,
        "last_updated": datetime.now().isoformat(),
        "data_sources": ["NSE Bulk Deals", "NSE Corporate Filings", "Yahoo Finance", "News Sentiment"],
        "scan_status": "success"
    }
