// Reference for the data-import screen: the officer dumps the app uses, what each one holds,
// its column list, the Oracle SELECT to run on the live machine to produce the dump, and a
// copy-paste example of the resulting INSERT. Everything else (rank/unit/job lookups, committee
// categories, etc.) is seeded by the system and is NOT imported. The importer still accepts a
// few retired dumps (TAHIL_3LMY, TAHIL_3ASKARY, OFFICER_CHILDREN, MEMBERS) not listed here.
//
// Each SELECT's column aliases are written to EXACTLY match the INSERT column names (same
// names, same order), so exporting the result as INSERT statements yields the expected shape
// verbatim. NOTE: example SQL keeps Western digits (Arabic-Indic digits are only for numbers
// shown in the Arabic UI). The queries filter by the bulletin date (NASHRA_DATE = '1-1-2027')
// which selects that committee's officers — replace it with your bulletin date.

export interface ImportTableExample {
  oracle: string;      // Oracle source name (written after INSERT INTO, e.g. OFF.SECURITYS)
  target: string;      // our SQLite table it loads into (shown for reference)
  label: string;       // Arabic label
  desc: string;        // short Arabic description of the data
  columns: string;     // the accepted column list
  selectQuery?: string; // the Oracle SELECT to run on the live machine to generate the dump
  example: string;     // a ready-to-paste example of the resulting INSERT
}

export interface ImportTableGroup {
  title: string;
  note?: string;
  tables: ImportTableExample[];
}

export const IMPORT_GUIDE: ImportTableGroup[] = [
  {
    title: 'البيانات الأساسية للضباط',
    note: 'صف واحد لكل ضابط. الحقل ID هو معرّف الضابط الذي تُربط به بقية البيانات والصور.',
    tables: [
      {
        oracle: 'ELASASY',
        target: 'officers',
        label: 'الضباط',
        desc: 'الرتبة والوحدة والوظيفة والتخصص كنص، مع بيانات الضابط الأساسية. للجنة التمثيل العسكري: يُرشَّح الضابط من ASAASY=«مرشح تمثيل عسكرى» + TRANING_YEAR (ACTIV_CODE=5)، وكل الضباط المستوردين هم المرشحون. حقل ACTIV_NOTE هو «لشغل وظيفة» ويظهر افتراضياً في بيانات الضباط قابلاً للتعديل.',
        columns:
          'ID, PER_NAME, FULL_RANK, AKDAM_NO, AKDAM_REP, AKDAMEYA, UNT_N, JOB_N, SPECIALITY, ' +
          'TRANING_YEAR, ACTIV_NOTE, ARM_C, DOFA_NO, DATE_RANK, DATE_ENTER, DATE_TRANS, DATE_BIRTH, IS_DELETED, ' +
          'HEIGHT, WEIGHT, MARIT_N',
        selectQuery: `select e.id                                          AS ID,
       e.PER_NAME                                    AS PER_NAME,
       r.RAN_N || ' ' || kf.KIN_N || ' ' || e.ARKAN  AS FULL_RANK,
       e.AKDAM_NO                                    AS AKDAM_NO,
       e.AKDAM_REP                                   AS AKDAM_REP,
       (e.AKDAM_NO || e.AKDAM_REP)                   AS AKDAMEYA,
       u.UNT_N                                       AS UNT_N,
       m.JOB_N                                       AS JOB_N,
       s.SPEB_N                                      AS SPECIALITY,
       dt.TRANING_YEAR                               AS TRANING_YEAR,
       dt.ACTIV_NOTE                                 AS ACTIV_NOTE,
       u.ARM_C                                       AS ARM_C,
       e.DOFA_NO                                     AS DOFA_NO,
       e.DATE_RANK                                   AS DATE_RANK,
       e.DATE_ENTER                                  AS DATE_ENTER,
       e.DATE_TRANS                                  AS DATE_TRANS,
       e.DATE_BIRTH                                  AS DATE_BIRTH,
       0                                             AS IS_DELETED,
       e.HEIGHT                                      AS HEIGHT,
       e.WEIGHT                                      AS WEIGHT,
       mr.MARIT_N                                    AS MARIT_N
from   elasasy e, dobat_tbl dt, commander.per_tbl pt, units u, mrtb m, specb s, rank r, kindoff kf, marit mr
where  e.ID = pt.OFFICER_ID
  and  e.ARM_C = 1
  and  e.UNT_C = u.UNT_C
  and  e.JOB_C = m.JOB_C
  and  e.SPE_C = s.SPEB_C (+)
  and  e.MARIT_C = mr.MARIT_C (+)
  and  e.RAN_C = r.RAN_C
  and  e.KIN_C = kf.KIN_C
  and  pt.ASAASY = 'مرشح تمثيل عسكرى'
  and  dt.SER_NO = pt.SER_NO
  and  dt.ACTIV_CODE = 5
  and  dt.TRANING_YEAR in (2026, 2027);`,
        example: `Insert into OFF.ELASASY
   (ID, PER_NAME, FULL_RANK, AKDAM_NO, AKDAM_REP, AKDAMEYA, UNT_N, JOB_N, SPECIALITY,
    TRANING_YEAR, ACTIV_NOTE, ARM_C, DOFA_NO, DATE_RANK, DATE_ENTER, DATE_TRANS, DATE_BIRTH, IS_DELETED,
    HEIGHT, WEIGHT, MARIT_N)
 Values
   (9891, 'علي شرقاوي علي عبدالمنعم', 'عميد بحرى أ.ح', 1946, 'م3', '1946م3',
    'قيادة وحدات الدفاع الساحلي', 'قائد وحدات الدفاع الساحلى', 'مدفعية ساحلية',
    2026, 'ملحق دفاع سول', 1, 45,
    TO_DATE('01/01/2020 00:00:00', 'MM/DD/YYYY HH24:MI:SS'),
    TO_DATE('01/01/2000 00:00:00', 'MM/DD/YYYY HH24:MI:SS'),
    TO_DATE('01/01/2015 00:00:00', 'MM/DD/YYYY HH24:MI:SS'),
    TO_DATE('01/01/1975 00:00:00', 'MM/DD/YYYY HH24:MI:SS'), 0,
    178, 80, 'متزوج');`,
      },
    ],
  },
  {
    title: 'بيانات الضباط المرتبطة',
    note: 'كل الجداول التالية تُربط بالضابط عبر OFFICER_ID (أو ID) المطابق لمعرّف الضابط.',
    tables: [
      {
        oracle: 'SECURITYS',
        target: 'officer_kafaa',
        label: 'تقارير الكفاءة',
        desc: 'تقييم القائد المباشر (KAED) والمصدق (MOSDAK) والتقدير لكل فترة. قد تخلو بعض الصفوف من KAED/MOSDAK.',
        columns: 'ID, FROM_DATE_C, TO_DATE, MOSDAK, KAED, FROM_DATE, GRADE_COM',
        selectQuery: `SELECT DISTINCT securitys.ID,
                TO_CHAR (securitys.from_date, 'mm-rrrr') from_date_c,
                TO_CHAR (securitys.TO_DATE, 'mm-rrrr') TO_DATE, per_comm AS MOSDAK,
                per_app AS KAED, from_date, g1.grade_name grade_com
           FROM OFF.securitys,
                OFF.grades g1,
                OFF.grades g2,
                v_off_all_units,
                officer_details2 comm,
                officer_details2 app,
                officers_in_nashra oin
          WHERE rat_com_fk = g1.grade_id
            AND rat_app_fk = g2.grade_id
            AND v_off_all_units.ID = securitys.ID
            AND v_off_all_units.job_c IS NOT NULL
            AND to_number(per_comm) > 0
            AND to_number(per_app)  > 0
            AND (date_b = job_date)
            AND securitys.id_comm = comm.ID(+)
            AND securitys.id_app = app.ID(+)
            AND securitys.ID = oin.id
            AND oin.nashra_rank IN (3, 4, 5)
            AND TO_CHAR (OFF.gettaraky_c (oin.nashra_rank, oin.nashra_type, oin.nashra_tagdeed)) >= 3
            AND oin.taraky_tagdeed <> 'تجديد لواء'
            AND oin.NASHRA_DATE = '1-1-2027'
       ORDER BY from_date DESC;`,
        example: `Insert into OFF.SECURITYS
   (ID, FROM_DATE_C, TO_DATE, MOSDAK, KAED, FROM_DATE, GRADE_COM)
 Values
   (4646, '05-2026', '12-2025', 87, 87,
    TO_DATE('05/31/2026 00:00:00', 'MM/DD/YYYY HH24:MI:SS'), 'جيد جداً');`,
      },
      {
        oracle: 'JOBS',
        target: 'officer_holder_wazayef',
        label: 'الوظائف السابقة (التدرج الوظيفي)',
        desc: 'الرتبة والوحدة والوظيفة والمرتب (RAN_N_1) ومدة الشغل، مع تلوين الصف حسب MARKED_COLOR (أخضر غامق عند وجود TARAKY_C، وأخضر فاتح عند TARAKY_C_SUGGESTED). تصل أيضاً باسم OFFICERS_HOLDER_WAZYEF.',
        columns: 'ID, RAN_N, UNT_N, JOB_N, FROM_DATE, TO_DATE_, YEAR, MONTH, RAN_N_1, WASFIA_TUAHEL_TRKY, TARAKY_C, TARAKY_C_SUGGESTED, MARKED_COLOR',
        selectQuery: `SELECT nrt.ID, r.ran_n, u.unt_n, m.job_n, nrt.date1 AS from_date,
       nrt.date2 AS to_date_,
       OFF.get_years_diff (nrt.date1, nrt.date2) AS YEAR,
       OFF.get_months_diff (nrt.date1, nrt.date2) AS MONTH, rm.ran_n,
       taraky_n AS wasfia_tuahel_trky,
       m.TARAKY_C,
       m.TARAKY_C_SUGGESTED,
       case when m.TARAKY_C is not null then 'dark_green'
            when m.TARAKY_C_SUGGESTED is not null then 'light_green'
            else null
       end as marked_color
  FROM OFF.nah_rankd_tmp nrt,
       OFF.RANK r,
       RANK rm,
       OFF.mrtb m,
       OFF.units u,
       OFF.taraky_ranks tr,
       officers_in_nashra oin
 WHERE r.ran_c(+) = nrt.rank_c
   AND u.unt_c = nrt.unit_c
   AND m.ran_c = rm.ran_c(+)
   AND tr.taraky_c(+) = m.taraky_c
   AND m.job_c = nrt.job_c
   AND nrt.ID = oin.id
   AND nrt.date2 IS NOT NULL
   AND oin.nashra_rank IN (3, 4, 5)
   AND TO_CHAR (OFF.gettaraky_c (oin.nashra_rank, oin.nashra_type, oin.nashra_tagdeed)) >= 3
   AND oin.taraky_tagdeed <> 'تجديد لواء'
   AND oin.NASHRA_DATE = '1-1-2027';`,
        example: `Insert into OFF.JOBS
   (ID, RAN_N, UNT_N, JOB_N, FROM_DATE, TO_DATE_, YEAR, MONTH, RAN_N_1, WASFIA_TUAHEL_TRKY, TARAKY_C, TARAKY_C_SUGGESTED, MARKED_COLOR)
 Values
   (4564, 'عقيد', 'شعبة التنظيم والادارة البحرية', 'رئيس فرع التنظيم والمرتبات',
    TO_DATE('07/03/2022 00:00:00', 'MM/DD/YYYY HH24:MI:SS'),
    TO_DATE('01/02/2024 00:00:00', 'MM/DD/YYYY HH24:MI:SS'), 1, 6, 'عميد', NULL, NULL, NULL, NULL);`,
      },
      {
        oracle: 'BA3AST',
        target: 'officer_holder_paasat',
        label: 'البعثات والمأموريات',
        desc: 'نوع النشاط (ACTIV_CODE: ١ = بعثة، ٣ = مأمورية) والدولة والمدة والبيان.',
        columns: 'OFFICER_ID, ACTIV_NOTE, ACTIV_CODE, ACTIV_NAME, DATE_FROM, DATE_TO, COUNTRY_NAME',
        selectQuery: `select per_tbl.officer_id , activ_note, commander.activ_tbl.activ_code, activ_name, to_date(nvl(plan_day, '1') || '/' || plan_month || '/' || plan_year, 'dd/mm/yyyy') date_from, to_date(nvl(fo_day, '1') || '/' || fo_month || '/' || fo_year, 'dd/mm/yyyy') date_to, country_name
from off.per_tbl, dobat_tbl, commander.country_tbl, commander.activ_tbl, off.officers_in_nashra oin
where dobat_tbl.country_code = country_tbl.country_code
and per_tbl.ser_no = dobat_tbl.ser_no
and commander.activ_tbl.activ_code = dobat_tbl.activ_code
and oin.id = per_tbl.officer_id
and plan_month is not null
and plan_year is not null
and fo_month is not null
and fo_year is not null
and safer_yomeyaa = 'Y'
AND oin.nashra_rank IN (3, 4, 5)
AND TO_CHAR (OFF.gettaraky_c (oin.nashra_rank, oin.nashra_type, oin.nashra_tagdeed)) >= 3
AND oin.taraky_tagdeed <> 'تجديد لواء'
AND oin.NASHRA_DATE = '1-1-2027'
order by date_from desc;`,
        example: `Insert into OFF.BA3AST
   (OFFICER_ID, ACTIV_NOTE, ACTIV_CODE, ACTIV_NAME, DATE_FROM, DATE_TO, COUNTRY_NAME)
 Values
   (3573, 'للمشاركة بدورة في مجال (جمع وتحليل المعلومات)', 3, 'مأمورية',
    TO_DATE('06/29/2026 00:00:00', 'MM/DD/YYYY HH24:MI:SS'),
    TO_DATE('07/11/2026 00:00:00', 'MM/DD/YYYY HH24:MI:SS'), 'اليونان');`,
      },
      {
        oracle: 'GAZA',
        target: 'officer_punishments_geza',
        label: 'المحاكمات والجزاءات',
        desc: 'نص كامل واحد لكل واقعة — محاكمة أو جزاء (التاريخ مضمَّن داخل النص). الاثنان في نفس الجدول/العبارة ويُعرضان في تبويب واحد.',
        columns: 'ID, GAZA',
        selectQuery: `SELECT oin.ID, off.get_geza_mo7akma_txt(vmgd.case_type, vmgd.tariekh, vmgd.notes, vmgd.hokm, vmgd.moddah, vmgd.hokm_txt, vmgd.delay_cnt, vmgd.gharamah) AS GAZA
  FROM off.v_mo7_gez_data vmgd, officers_in_nashra oin
 WHERE vmgd.id = oin.id
   AND oin.nashra_rank IN (3, 4, 5)
   AND TO_CHAR (OFF.gettaraky_c (oin.nashra_rank, oin.nashra_type, oin.nashra_tagdeed)) >= 3
   AND oin.taraky_tagdeed <> 'تجديد لواء'
   AND oin.nashra_date = '1-1-2027';`,
        example: `Insert into GAZA
   (ID, GAZA)
 Values
   (1266, 'بتاريخ 29-09-2008 - صدق السيد قائد القوات البحرية على عزلة من القيادة لإرتكابة الأتى : 1 - عدم قيامة بتنفيذ العمرات الرئيسية للمدفعية فى الوحدة قيادتة   2- عدم قيامة بتسجيل إجراءات الشد الصناعى للمدافع  3-عدم قيامة بتنفيذ طابور العمل الثابت للصيانة');`,
      },
      {
        oracle: 'SE7A',
        target: 'officer_holder_health',
        label: 'الحالة الصحية',
        desc: 'نص كامل واحد لكل حالة (التاريخ مضمَّن داخل النص).',
        columns: 'ID, SE7A',
        selectQuery: `SELECT ALL TWSIA.ID as ID, 'بتاريخ ' || TWSIA.DESEASE_DATE || ' - ' || TWSIA.TWS_NOTE || ' - ' || twsia_result.result_n as se7a
    FROM OFF.TWSIA , twsia_result, officers_in_nashra oin
    WHERE TWSIA.ID = oin.ID
    and twsia.result_c = twsia_result.result_c
    AND oin.nashra_rank IN (3, 4, 5)
    AND TO_CHAR (OFF.gettaraky_c (oin.nashra_rank, oin.nashra_type, oin.nashra_tagdeed)) >= 3
    AND oin.taraky_tagdeed <> 'تجديد لواء'
    AND oin.NASHRA_DATE = '1-1-2027';`,
        example: `Insert into OFF.SE7A
   (ID, SE7A)
 Values
   (4564, 'بتاريخ 17-03-2009 - ضغط سمع حسى عصبى من متوسط الى شديد بالاذن اليمنى - - لائق للمستوى الأدنى (ب)');`,
      },
      {
        oracle: 'TASHKEELAT',
        target: 'officer_tashkeelat',
        label: 'خدمة التشكيلات',
        desc: 'مدة خدمة التشكيلات (TASHKEELAT) ومدة الخدمة الكلية (KHADMA) لكل ضابط، كنص. تُستخدم لحساب نسبة خدمة التشكيلات في درجة مسير الخدمة. مهم: يجب تضمين عمود ID (معرّف الضابط) وإلا لا يمكن ربط الصف بالضابط.',
        columns: 'ID, TASHKEELAT, KHADMA',
        selectQuery: `select akp.id AS ID,
       off.to_month_year(akp.PERIOD_KHADMAT_TASHKEELAT) as TASHKEELAT,
       off.to_month_year(akp.PERIOD_KHADMA) as KHADMA
  from ALL_KHADMA_PERIODS akp, officers_in_nashra oin
 where akp.id = oin.id
   AND oin.NASHRA_DATE = '1-1-2027';`,
        example: `Insert into TASHKEELAT
   (ID, TASHKEELAT, KHADMA)
 Values
   (3578, '12 سنة 4 شهر', '25 سنة 2 شهر');`,
      },
      {
        oracle: 'WISAM',
        target: 'officer_medals',
        label: 'الأوسمة والأنواط',
        desc: 'صف لكل وسام/نوط حصل عليه الضابط (WIS_N). تُستخدم في حساب درجة الأوسمة بمسير الخدمة.',
        columns: 'ID, WIS_N',
        selectQuery: `select e.id AS ID, w22.WIS_N AS WIS_N
  from off.wisam w12, off.wisamc w22, elasasy e, officers_in_nashra oin
 where e.id = w12.id
   and w12.wis_c = w22.wis_c
   and e.id = oin.id
   AND oin.NASHRA_DATE = '1-1-2027';`,
        example: `Insert into WISAM
   (ID, WIS_N)
 Values
   (3578, 'نوط الخدمة الطويلة والقدوة الحسنة');`,
      },
      {
        oracle: 'TAHIL',
        target: 'officer_qualification',
        label: 'التأهيل (بالدرجة)',
        desc: 'وصف التأهيل (TXT) ودرجته (GRADE) لكل ضابط — الدرجة تُختار حسب الرتبة (عقيد فأعلى تأخذ GRADE_AGEED وإلا GRADE_AMEED). تُستخدم في حساب درجة التأهيل بمسير الخدمة. عمود PER_NAME اختياري ويُتجاهَل. (منفصل عن الدراسات العلمية/التأهيل العسكري المعروضين في الـ CV.)',
        columns: 'ID, TXT, GRADE',
        selectQuery: `select e.ID AS ID, ot.txt AS TXT,
       case when e.RAN_C >= 5 then NVL(ot.GRADE_AGEED, ot.GRADE_AMEED)
            else ot.GRADE_AMEED end as GRADE
  from elasasy e, OFFICER_TAHIL ot, officers_in_nashra oin
 where e.id = ot.ID
   and e.id = oin.id
   AND oin.NASHRA_DATE = '1-1-2027';`,
        example: `Insert into TAHIL
   (ID, TXT, GRADE)
 Values
   (3578, 'دورة أركان حرب', 170);`,
      },
    ],
  },
];
