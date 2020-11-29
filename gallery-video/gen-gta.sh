#!/bin/bash

if [ -z "$FFMPEG" ]; then FFMPEG=ffmpeg; fi

# unpack original into seperate frames 
mkdir -p gta-frames
$FFMPEG -loglevel quiet -stats -i gta-orig.webm gta-frames/gta-%03d.png -y

for PPF in 1 2 5 10 20 50 100 150 200 300 600 1200 1600 2000 2400; do
  echo gta-${PPF}.webp
	$FFMPEG -loglevel quiet -stats -r 30 -i gta-frames/gta-%03d.png -c:v splash -ppf $PPF -ppk 2 splash-gta-${PPF}.mkv -y
	$FFMPEG -loglevel quiet -stats -r 30 -i splash-gta-${PPF}.mkv gta-${PPF}.webp -y
done

# Upscale 90x50 to 420x236
$FFMPEG -loglevel quiet -stats -r 30 -i splash-gta-1.mkv  -vf scale=90:50   -crf 18 gta-90x50.mkv -y
$FFMPEG -loglevel quiet -stats -r 30 -i gta-90x50.mkv     -vf scale=420:236 -crf 18 gta-90x50-420x236.mkv -y
$FFMPEG -loglevel quiet -stats -r 30 -i gta-90x50.mkv     -vf scale=420:236 -crf 18 gta-90x50-420x236.webp -y

# Upscale 285x160 to 420x236
$FFMPEG -loglevel quiet -stats -r 30 -i splash-gta-1.mkv  -vf scale=285:160 -crf 18 gta-285x160.mkv -y
$FFMPEG -loglevel quiet -stats -r 30 -i gta-285x160.mkv   -vf scale=420:236 -crf 18 gta-285x160-420x236.mkv -y
$FFMPEG -loglevel quiet -stats -r 30 -i gta-285x160.mkv   -vf scale=420:236 -crf 18 gta-285x160-420x236.webp -y

# scale PPF=100 to 420x236
$FFMPEG -loglevel quiet -stats -r 30 -i splash-gta-100.mkv  -vf scale=420:236 -crf 18 gta-100-420x236.mkv -y

# Create GTA side-by-size
$FFMPEG -i gta-100-420x236.mkv -i gta-90x50-420x236.mkv -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" gta-sbs.webp
