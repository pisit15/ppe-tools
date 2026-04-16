# EA SHE PPE Dashboard — Project Context

## Company & Domain
**EA SHE** = Safety, Health & Environment division
**AMT** = บริษัทที่ใช้ระบบนี้ (company_id: `amt`)
ระบบนี้ใช้จัดการ PPE (อุปกรณ์ความปลอดภัยส่วนบุคคล) เช่น ถุงมือ หมวก แว่นตา หน้ากาก รองเท้า ชุดป้องกัน

## Current Data (as of April 2026)
- 209 products (PPE items)
- 935+ transactions (stock-in/out/borrow/return)
- 135 employees across 6 departments
- Data migrated from Excel spreadsheets

## Design Philosophy
- **Tableau-inspired** data visualization — clarity, contrast, meaningful color
- **Thai-first UI** — ทุก label, button, placeholder เป็นภาษาไทย
- **Data-driven decisions** — KPI cards, charts, searchable tables ที่ช่วยวางแผนจัดซื้อ/ตรวจสอบ
- **Professional UX** — searchable dropdowns (ไม่ใช่ native select 209 items), toast notifications, collapsible filters
- **No external chart library** — custom SVG charts เพื่อ control ทุก pixel และลด bundle size

## Architecture Decisions
1. **No shared UI component library yet** — searchable dropdown, toast, KPI card ถูกเขียน inline ในแต่ละ page. ถ้าเริ่มมี 4+ pages ใช้ pattern เดียวกัน ควร extract เป็น shared components
2. **Supabase VIEW สำหรับ stock summary** — `ppe_stock_summary` คำนวณ total_in/total_out/current_stock ฝั่ง DB เพื่อความถูกต้อง
3. **API routes เป็น thin layer** — validation พื้นฐาน + Supabase query + error handling. ไม่มี middleware, ไม่มี ORM
4. **Direct main branch** — ไม่ใช้ feature branch เนื่องจากเป็น single developer project

## Deployment
- GitHub repo: `pisit15/ppe-tools`
- Vercel project connected to repo — push to main = auto deploy
- Domain: `tools.eashe.org`

## Roadmap / Future Work
- **Inventory page redesign** — ให้ consistent กับหน้าอื่นที่ redesign แล้ว
- **Shared component extraction** — SearchableDropdown, Toast, KPICard
- **Export reports** — PDF/Excel download
- **Dashboard analytics** — trend analysis, usage forecasting, cost tracking
- **Multi-company support** — ขยายจาก AMT เป็นหลายบริษัท
- **User authentication & roles** — admin vs viewer vs operator
- **Mobile responsive** — optimize สำหรับ tablet/phone ในโรงงาน
