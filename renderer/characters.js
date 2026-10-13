(function () {
  'use strict';
  const profiles = {
    chiikawa: { name: '치이카와', speed: 13, action: 'hello', lines: {
      idle: ['와아...', '응!', '에헤헤...', '와...!', '후우...'],
      pet: ['에헤헤!', '와아!', '응...!', '헤헤...', '와...!'],
      before: ['후우...', '응...!', '으...응!', '와아...'],
      lunch: ['냠...', '와아!', '음...!', '에헤헤...'],
      after: ['후우...', '와아...!', '응!', '헤헤...'],
      off: ['에헤헤...', '와아...', '음...', '응!'],
      rest: ['후우...', '응...', '와아...']
    } },
    hachiware: { name: '하치와레', speed: 14.3, action: 'look', lines: {
      idle: ['오늘도 같이 힘내자!', '조금씩 해도 괜찮아!', '잘하고 있네!', '좋은 일이 생길 것 같아!', '잠깐 하늘 좀 볼까?'],
      pet: ['헤헤, 기분 좋다!', '고마워!', '같이 있으니까 좋네!', '또 쓰다듬어 줘!', '응, 여기 있어!'],
      before: ['오늘도 함께하는 거지?', '천천히 준비하자!', '좋은 아침이야!', '오늘은 어떤 날일까?'],
      lunch: ['잘 먹겠습니다!', '같이 먹으니까 맛있네!', '맛있는 냄새가 나!', '한 입 먹고 힘내자!', '이거 맛있다는 거지?'],
      after: ['오늘도 열심히 했네!', '이제 푹 쉬자!', '내일도 같이 힘내자!', '수고했어, 또 봐!', '오늘도 잘 해냈어!'],
      off: ['오늘은 느긋하게 쉬자!', '이런 날도 좋은 거지!', '같이 산책할까?', '하늘이 참 예쁘네!'],
      rest: ['잠깐 쉬어도 괜찮아!', '한숨 돌리고 하자!', '물 한 모금 마실까?', '어깨도 살짝 풀자!']
    } },
    usagi: { name: '우사기', speed: 15.6, action: 'hop', lines: {
      idle: ['야하!', '우라!', '푸루루!', '야하하!', '하아?'],
      pet: ['야하!', '푸루루루!', '우라!', '야하하!', '후!'],
      before: ['우라!', '야하!', '하아?', '푸루루!'],
      lunch: ['야하!', '우라!', '푸루루!', '하아?', '야하하!'],
      after: ['우라!', '야하!', '푸루루루!', '야하하!'],
      off: ['야하하!', '푸루루!', '우라!', '하아?'],
      rest: ['푸루루!', '하아?', '야하!']
    } },
    momonga: { name: '모몽가', speed: 13.8, action: 'showoff', foodX: 120, foodY: 278, lines: {
      idle: ['나 좀 봐!', '귀엽지?', '칭찬해 줘!', '귀여운 포즈다!', '관심 좀 줘!'],
      pet: ['더 귀여워해 줘!', '더 쓰다듬어 줘!', '귀엽다고 해 줘!', '헤헹! 좋다!', '나만 봐!'],
      before: ['벌써 준비했지!', '오늘도 날 봐 줘!', '칭찬부터 해 줘!', '이 귀여움을 봐!'],
      lunch: ['나도 한 입 줘!', '맛있는 걸로 줘!', '간식도 줘!', '내 몫도 있지?', '한 입 더!'],
      after: ['나도 수고했어!', '칭찬하고 보내 줘!', '귀여운 퇴근이다!', '이제 쉬게 해 줘!', '내일도 날 봐 줘!'],
      off: ['오늘은 실컷 쉬겠다!', '놀아 줘!', '내 포즈 좀 봐!', '귀여워해 줘!'],
      rest: ['나도 쉬겠다!', '쉬면서 날 봐!', '간식 좀 줘!', '칭찬도 쉬지 마!']
    } }
  };
  function crop(image, x, y, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width); canvas.height = Math.ceil(height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (pixels[offset + 3] < 180 || (pixels[offset] > 190 && pixels[offset + 1] < 100 && pixels[offset + 2] < 100)) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < left) throw new Error('캐릭터 이미지의 표시 영역을 찾지 못했습니다.');
    left = Math.max(0, left - 2); top = Math.max(0, top - 2);
    right = Math.min(canvas.width - 1, right + 2); bottom = Math.min(canvas.height - 1, bottom + 2);
    return { canvas, bounds: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } };
  }
  function normalize(sources, drawWidth = 230) {
    const base = sources[0].bounds, height = Math.min(300, Math.round(drawWidth * base.height / base.width));
    const frames = sources.map(({ canvas: source, bounds }) => {
      const frame = document.createElement('canvas'); frame.width = 300; frame.height = 340;
      const context = frame.getContext('2d'); context.imageSmoothingQuality = 'high';
      context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, (300 - drawWidth) / 2, 326 - height, drawWidth, height);
      return frame;
    });
    // A stable upper body prevents sprite-to-sprite jitter; only the feet alternate.
    const feetTop = 326 - Math.round(height * .16);
    const stableStep = document.createElement('canvas'); stableStep.width = 300; stableStep.height = 340;
    const context = stableStep.getContext('2d');
    context.drawImage(frames[1], 0, 0);
    context.clearRect(0, feetTop, 300, 340 - feetTop);
    context.drawImage(frames[2], 0, feetTop, 300, 340 - feetTop, 0, feetTop, 300, 340 - feetTop);
    frames[2] = stableStep;
    return frames;
  }
  function prepare(atlas, momonga) {
    const rows = [{ y: 28, height: 279 }, { y: 309, height: 263 }, { y: 573, height: 305 }];
    const columns = [23, 314, 605, 896, 1187, 1478];
    const scaleX = atlas.naturalWidth / 1774, scaleY = atlas.naturalHeight / 887;
    const frames = Object.fromEntries(['chiikawa', 'hachiware', 'usagi'].map((id, index) => {
      const row = rows[index];
      return [id, normalize(columns.map(x => crop(atlas, x * scaleX, row.y * scaleY, 280 * scaleX, row.height * scaleY)))];
    }));
    const edges = [0, 420, 834, 1254], sx = momonga.naturalWidth / 1254, cellHeight = momonga.naturalHeight / 2;
    frames.momonga = normalize(Array.from({ length: 6 }, (_, index) => {
      const column = index % 3;
      return crop(momonga, edges[column] * sx, Math.floor(index / 3) * cellHeight, (edges[column + 1] - edges[column]) * sx, cellHeight);
    }), 270);
    return frames;
  }
  window.WidgetCharacters = Object.freeze({ profiles, crop, prepare });
})();
