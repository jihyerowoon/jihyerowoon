#!/usr/bin/env python3
"""학생 PPT 슬라이드를 현재 웹앱의 이미지 활동지로 설치한다.
실행: python scripts/install_worksheet_images.py PPT_이미지_입력시연.zip
주의: 이 ZIP에는 학생용 34쪽만 있어야 한다. 공통 정답지 ZIP은 절대로 입력하지 않는다.
"""
import json, pathlib, re, sys, zipfile
if len(sys.argv)!=2: raise SystemExit("사용법: python scripts/install_worksheet_images.py 학생용이미지.zip")
source=pathlib.Path(sys.argv[1])
dest=pathlib.Path(__file__).resolve().parents[1]/"public"/"worksheets"
allowed={"L1_AI","L1_TEACHER","L2_AI","L2_TEACHER"}
ranges={1:{"Preview":[1],"Question":[1],"Read":[2,3],"Reflect":[4,5,6],"Recite":[7],"Review":[8]},
        2:{"Preview":[1],"Question":[1],"Read":[2,3,4],"Reflect":[5,6,7],"Recite":[8],"Review":[9]}}
group_map={"AI":"EXPERIMENT","TEACHER":"CONTROL"}
manifest={"version":"worksheet-ppt-20261023","lessons":{}}
files={}
with zipfile.ZipFile(source) as z:
    for m in z.infolist():
        if m.is_dir() or "/student/" not in m.filename or not m.filename.lower().endswith(".png"):continue
        folder,name=m.filename.split("/student/",1)[1].split("/",1)
        if folder not in allowed or "/" in name or not re.match(r"^\d{2}_[A-Za-z0-9_]+\.png$",name):continue
        if any(q in name.lower() for q in ("answer","solution","key","정답","풀이")):raise RuntimeError("정답지를 public에 올릴 수 없습니다.")
        lesson=int(folder[1]);expected=8 if lesson==1 else 9
        page=int(name[:2])
        if not (1<=page<=expected):raise RuntimeError("페이지 번호 오류")
        target=dest/folder/name;target.parent.mkdir(parents=True,exist_ok=True)
        data=z.read(m)
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):raise RuntimeError("PNG 형식 오류")
        target.write_bytes(data);files[(folder,page)]="/worksheets/"+folder+"/"+name
for lesson,stages in ranges.items():
    manifest["lessons"][str(lesson)]={}
    for raw,g in group_map.items():
        folder=f"L{lesson}_{raw}"
        manifest["lessons"][str(lesson)][g]={}
        for stage,nums in stages.items():
            if not all((folder,n) in files for n in nums):raise RuntimeError("활동지 누락: "+folder+"/"+stage)
            manifest["lessons"][str(lesson)][g][stage]=[files[(folder,n)] for n in nums]
if len(files)!=34:raise RuntimeError("학생용 이미지 34개 필요. 실제 "+str(len(files))+"개")
(dest/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
print("성공: 학생용 34장 설치. src=public/worksheets, manifest=public/worksheets/manifest.json")
print("이후 git add public/worksheets && git commit -m 'Install student PPT worksheet slides'")
print("정답지 이미지는 public/worksheets에 올리지 마세요.")
