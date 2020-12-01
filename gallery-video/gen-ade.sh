#!/bin/bash

if [ -z "$FFMPEG" ]; then FFMPEG=ffmpeg; fi

# unpack original into separate frames
mkdir -p ade-frames
$FFMPEG -loglevel quiet -stats -i 20191018_025041.mp4 -t 11 -vf scale=900:506 ade-frames/ade-%03d.png -y

for PPF in 1 2 5 10 20 50 100 150 200 300 600 900 1200 1600 2000 2400; do
  echo ade-${PPF}.webp
	$FFMPEG -loglevel quiet -stats -r 30 -i ade-frames/ade-%03d.png -c:v splash -ppf $PPF -ppk 2 -qscale 85 splash-ade-${PPF}.mkv -y
	$FFMPEG -loglevel quiet -stats -r 30 -i splash-ade-${PPF}.mkv -qscale 85 ade-${PPF}.webp -y
done

# Upscale 90x50 to 420x236
echo Upscale 90x50
$FFMPEG -loglevel quiet -stats -r 30 -i splash-ade-1.mkv  -vf scale=90:50   -crf 18 -qscale 85 ade-90x50.mkv -y
$FFMPEG -loglevel quiet -stats -r 30 -i ade-90x50.mkv     -vf scale=420:236 -crf 18 -qscale 85 ade-90x50-420x236.mkv -y
$FFMPEG -loglevel quiet -stats -r 30 -i ade-90x50.mkv     -vf scale=420:236 -crf 18 -qscale 85 ade-90x50-420x236.webp -y

# Upscale 285x160 to 420x236
echo Upscale 285x160
$FFMPEG -loglevel quiet -stats -r 30 -i splash-ade-1.mkv  -vf scale=285:160 -crf 18 -qscale 85 ade-285x160.mkv -y
$FFMPEG -loglevel quiet -stats -r 30 -i ade-285x160.mkv   -vf scale=420:236 -crf 18 -qscale 85 ade-285x160-420x236.mkv -y
$FFMPEG -loglevel quiet -stats -r 30 -i ade-285x160.mkv   -vf scale=420:236 -crf 18 -qscale 85 ade-285x160-420x236.webp -y

# scale PPF=100 to 420x236
echo PPF=100
$FFMPEG -loglevel quiet -stats -r 30 -i splash-ade-100.mkv  -vf scale=420:236 -crf 18 -qscale 85 ade-100-420x236.mkv -y

# Create ade side-by-size
echo SBS
$FFMPEG -loglevel quiet -stats -i ade-100-420x236.mkv -i ade-90x50-420x236.mkv -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" -y -qscale 85 ade-sbs.webp

# preview
$FFMPEG -loglevel quiet -stats -i ade-100-420x236.mkv -i ade-frames/ade-001.png ade-preview.jpg
