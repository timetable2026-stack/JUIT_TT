"""Generates sample/Timetable_Sample_v1.xlsx and a revised _v2 with a handful of changes (for demoing the diff)."""
import random, copy, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

random.seed(7)
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "..", "sample"); os.makedirs(OUT, exist_ok=True)

faculty = [
 ("FAC001","Dr. Anil Sharma","anil.sharma@juitsolan.ac.in","Professor","HOD"),
 ("FAC002","Dr. Priya Verma","priya.verma@juitsolan.ac.in","Associate Professor","Faculty"),
 ("FAC003","Dr. Rajeev Thakur","rajeev.thakur@juitsolan.ac.in","Associate Professor","Faculty"),
 ("FAC004","Dr. Meena Chauhan","meena.chauhan@juitsolan.ac.in","Assistant Professor","Faculty"),
 ("FAC005","Dr. Vikram Negi","vikram.negi@juitsolan.ac.in","Assistant Professor","Faculty"),
 ("FAC006","Ms. Shruti Kapoor","shruti.kapoor@juitsolan.ac.in","Assistant Professor","Faculty"),
 ("FAC007","Mr. Deepak Rana","deepak.rana@juitsolan.ac.in","Assistant Professor","Faculty"),
 ("FAC008","Dr. Neha Bhardwaj","neha.bhardwaj@juitsolan.ac.in","Assistant Professor","Faculty"),
 ("FAC009","Dr. Sanjay Kaushal","sanjay.kaushal@juitsolan.ac.in","Professor","Faculty"),
 ("FAC010","Ms. Ritika Sood","ritika.sood@juitsolan.ac.in","Assistant Professor","Faculty"),
 ("FAC011","Mr. Arun Mehta","arun.mehta@juitsolan.ac.in","Assistant Professor","Faculty"),
 ("FAC012","Dr. Kavita Jaswal","kavita.jaswal@juitsolan.ac.in","Associate Professor","Faculty"),
 ("ADMIN","Timetable Office","timetable2026@juitsolan.in","Office Superintendent","Admin"),
]
periods = [(1,"09:00","09:50",""),(2,"10:00","10:50",""),(3,"11:00","11:50",""),(4,"12:00","12:50",""),(5,"13:00","13:50","Lunch"),(6,"14:00","14:50",""),(7,"15:00","15:50",""),(8,"16:00","16:50","")]
semesters = [("Sem 3","2026-07-20","2026-12-05","2026-27","8 Dec – 20 Dec 2026"),("Sem 5","2026-07-20","2026-12-05","2026-27","8 Dec – 20 Dec 2026"),("Sem 7","2026-07-20","2026-11-28","2026-27","1 Dec – 12 Dec 2026")]
# subject: (code, name, faculty, lectures/wk, lab faculty or None)
subjects = {
 "Sem 3": [("CS301","Data Structures","FAC002",3,"FAC006"),("CS302","Discrete Mathematics","FAC009",3,None),("CS303","Digital Logic Design","FAC003",3,"FAC007"),("CS304","Object Oriented Programming","FAC004",3,"FAC010"),("MA301","Probability & Statistics","FAC012",3,None),("HS301","Technical Communication","FAC006",2,None)],
 "Sem 5": [("CS501","Operating Systems","FAC005",3,"FAC007"),("CS502","Database Management Systems","FAC008",3,"FAC011"),("CS503","Computer Networks","FAC003",3,"FAC011"),("CS504","Design & Analysis of Algorithms","FAC002",3,None),("CS505","Software Engineering","FAC004",3,None),("CS506","Theory of Computation","FAC009",2,None)],
 "Sem 7": [("CS701","Machine Learning","FAC008",3,"FAC010"),("CS702","Compiler Design","FAC005",3,None),("CS703","Cloud Computing","FAC012",3,"FAC006"),("CS704","Information Security","FAC001",2,None),("CS705","Major Project","FAC001",0,"FAC001;FAC012")],
}
sections = {"Sem 3":["A","B"],"Sem 5":["A","B"],"Sem 7":["A"]}
rooms_l = {"Sem 3":["LH-1","LH-2"],"Sem 5":["LH-3","LH-4"],"Sem 7":["LH-5"]}
labs = ["Lab-1","Lab-2","Lab-3","Lab-4"]
DAYS=["Mon","Tue","Wed","Thu","Fri"]

rows=[]
fac_busy=set(); room_busy=set()
def free(fids, room, d, p):
    return all((f,d,p) not in fac_busy for f in fids) and (room,d,p) not in room_busy
def book(fids, room, d, p):
    for f in fids: fac_busy.add((f,d,p))
    room_busy.add((room,d,p))

for sem in semesters:
    sname=sem[0]
    for si,sec in enumerate(sections[sname]):
        room=rooms_l[sname][si]
        slots=[(d,p) for d in DAYS for p in (1,2,3,4,6,7,8)]
        random.shuffle(slots)
        taken=set()
        for code,name,fid,nlec,labf in subjects[sname]:
            placed=0
            for d,p in slots:
                if placed>=nlec: break
                if (d,p) in taken or not free([fid],room,d,p): continue
                rows.append([sname,sec,d,p,"","",code,name,"Lecture",fid,room,"",""]); book([fid],room,d,p); taken.add((d,p)); placed+=1
            if labf:
                fids=[fid]+labf.split(";") if code!="CS705" else labf.split(";")
                for d in random.sample(DAYS,len(DAYS)):
                    ok=False
                    for p in (6,7):
                        if (d,p) in taken or (d,p+1) in taken: continue
                        lab=next((l for l in labs if free(fids,l,d,p) and free(fids,l,d,p+1)),None)
                        if lab and all((f,d,p) not in fac_busy and (f,d,p+1) not in fac_busy for f in fids):
                            for pp in (p,p+1):
                                rows.append([sname,sec,d,pp,"","",code,name+(" Lab" if code!="CS705" else ""),"Lab" if code!="CS705" else "Project",";".join(fids),lab,"B1" if code!="CS705" else "","Bring laptops" if code=="CS701" else ""]); book(fids,lab,d,pp); taken.add((d,pp))
                            ok=True; break
                    if ok: break

def write(path, rows, faculty, periods, semesters):
    wb=Workbook(); ws=wb.active; ws.title="Timetable"
    hdr=Font(bold=True,color="FFFFFF"); fill=PatternFill("solid",fgColor="1F3A5F")
    def sheet(ws,headers,data,widths):
        ws.append(headers)
        for c in range(1,len(headers)+1):
            ws.cell(1,c).font=hdr; ws.cell(1,c).fill=fill; ws.column_dimensions[get_column_letter(c)].width=widths[c-1]
        for r in data: ws.append(list(r))
        ws.freeze_panes="A2"
    sheet(ws,["Semester","Section","Day","Period","Start","End","Subject code","Subject name","Type","Faculty ID","Room","Batch","Notes"],rows,[10,9,7,8,8,8,13,34,10,18,9,8,20])
    sheet(wb.create_sheet("Faculty"),["Faculty ID","Full name","Email","Department","Designation","Phone","Role"],[(f[0],f[1],f[2],"CSE",f[3],"",f[4]) for f in faculty],[11,24,34,12,22,12,9])
    sheet(wb.create_sheet("Periods"),["Period","Start","End","Break","Label"],[(p[0],p[1],p[2],"Yes" if p[3] else "",p[3]) for p in periods],[8,8,8,8,10])
    sheet(wb.create_sheet("Semesters"),["Semester","Start date","End date","Academic year","Exam window"],semesters,[10,12,12,14,24])
    wb.save(path)

rows.sort(key=lambda r:(r[0],r[1],DAYS.index(r[2]),r[3]))
write(os.path.join(OUT,"Timetable_Sample_v1.xlsx"), rows, faculty, periods, semesters)

# v2: a few realistic changes
r2=copy.deepcopy(rows)
# 1. room change: all Sem 3 A lectures in LH-1 -> LH-6 (repair)
for r in r2:
    if r[0]=="Sem 3" and r[1]=="A" and r[10]=="LH-1": r[10]="LH-6"
# 2. reassign CS302 lectures from FAC009 to FAC012 in Sem 3 B
for r in r2:
    if r[6]=="CS302" and r[1]=="B": r[9]="FAC012"
# 3. move one HS301 lecture (Sem 3 A) to Fri P8 if free
cand=[r for r in r2 if r[6]=="HS301" and r[1]=="A"]
if cand:
    r=cand[0]
    used={(x[2],x[3]) for x in r2 if x[0]=="Sem 3" and x[1]=="A"}
    busy={(x[2],x[3]) for x in r2 if "FAC006" in x[9].split(";")}
    for d in ["Fri","Thu","Wed","Tue","Mon"]:
        for pp in (8,7,6,4,3,2,1):
            if (d,pp) not in used and (d,pp) not in busy and not any(x[10]==r[10] and x[2]==d and x[3]==pp for x in r2):
                r[2]=d; r[3]=pp; d=None; break
        if d is None: break
# 4. remove one CS506 lecture in Sem 5 A
for i,r in enumerate(r2):
    if r[6]=="CS506" and r[1]=="A": del r2[i]; break
# 5. add a new tutorial
r2.append(["Sem 5","B","Sat",2,"","","CS504","Design & Analysis of Algorithms","Tutorial","FAC002","LH-4","","Doubt-clearing session"])
# 6. note change
for r in r2:
    if r[6]=="CS301" and r[8]=="Lab" and r[1]=="A": r[12]="Install the GCC toolchain before the lab"
r2.sort(key=lambda r:(r[0],r[1],(DAYS+["Sat"]).index(r[2]),r[3]))
write(os.path.join(OUT,"Timetable_Sample_v2_changes.xlsx"), r2, faculty, periods, semesters)
print(len(rows),"rows v1;",len(r2),"rows v2")
