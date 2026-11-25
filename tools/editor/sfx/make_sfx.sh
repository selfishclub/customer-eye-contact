#!/bin/bash
# 셀피쉬 편집기 효과음 합성 (외부 음원 없음)
set -e
D="$1"; cd "$D"
g(){ ffmpeg -nostdin -v error -y -f lavfi -t "$3" -i "aevalsrc=exprs='$2':sample_rate=44100" -af "$4" -ac 1 -b:a 128k "$1.mp3" </dev/null; }
g pop "0.6*sin(2*PI*(260+700*exp(-t*28))*t)*exp(-t*22)" 0.3 "afade=t=out:st=0.25:d=0.05"
g click "0.7*(random(1)*2-1)*exp(-t*260)+0.4*sin(2*PI*2400*t)*exp(-t*120)" 0.12 "highpass=f=800"
g click-soft "0.35*(random(2)*2-1)*exp(-t*200)+0.25*sin(2*PI*1600*t)*exp(-t*90)" 0.12 "lowpass=f=3500"
g whoosh-short "0.8*(random(3)*2-1)*pow(sin(PI*t/0.4),2)" 0.4 "bandpass=f=1200:width_type=o:w=2"
g whoosh "0.9*(random(4)*2-1)*pow(sin(PI*t/0.65),2)" 0.65 "lowpass=f=2500,highpass=f=200"
g typing "0.55*(random(5)*2-1)*exp(-mod(t,0.085)*240)" 1.4 "highpass=f=1200"
g key-press "0.7*(random(6)*2-1)*exp(-t*180)+0.3*sin(2*PI*900*t)*exp(-t*60)" 0.18 "highpass=f=500"
g ping "0.5*sin(2*PI*1320*t)*exp(-t*4.5)+0.15*sin(2*PI*2640*t)*exp(-t*7)" 1.1 "afade=t=out:st=0.95:d=0.15"
g sparkle "0.22*(sin(2*PI*2093*t)+0.7*sin(2*PI*2637*t)+0.5*sin(2*PI*3136*t))*exp(-t*2.8)*(0.6+0.4*sin(2*PI*13*t))" 1.5 "afade=t=out:st=1.3:d=0.2"
g notification "0.45*sin(2*PI*if(lt(t\,0.16)\,880\,1175)*t)*exp(-mod(t\,0.16)*7)" 0.7 "afade=t=out:st=0.55:d=0.15"
g chime "0.28*(sin(2*PI*523.25*t)+0.8*sin(2*PI*659.25*t)*gte(t\,0.08)+0.7*sin(2*PI*783.99*t)*gte(t\,0.16))*exp(-t*2.2)" 2.0 "afade=t=out:st=1.7:d=0.3"
g impact-bass-1 "0.95*sin(2*PI*(42+90*exp(-t*14))*t)*exp(-t*3.6)+0.35*(random(7)*2-1)*exp(-t*40)" 1.4 "lowpass=f=1800,afade=t=out:st=1.2:d=0.2"
for f in *.mp3; do printf "%s %s\n" "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 $f)"; done
