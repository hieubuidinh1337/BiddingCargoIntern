const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  Footer,
  PageNumber,
  PageBreak,
  ShadingType
} = require('docx');

// Common document styles & configurations
const FONT_NAME = 'Times New Roman';
const BORDER_SINGLE = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: '000000',
};
const TABLE_BORDERS = {
  top: BORDER_SINGLE,
  bottom: BORDER_SINGLE,
  left: BORDER_SINGLE,
  right: BORDER_SINGLE,
  insideHorizontal: BORDER_SINGLE,
  insideVertical: BORDER_SINGLE,
};

const CELL_MARGINS = {
  top: 100,
  bottom: 100,
  left: 150,
  right: 150,
};

// Common student & project info
const DEFAULT_INFO = {
  school: 'TRƯỜNG ĐẠI HỌC CÔNG NGHỆ TP. HCM',
  faculty: 'KHOA CÔNG NGHỆ THÔNG TIN',
  title: 'BÁO CÁO TIẾN ĐỘ ĐỒ ÁN CHUYÊN NGÀNH',
  studentName: 'Bùi Đình Hiếu',
  studentId: '2380600640',
  className: '23DTHC2',
  projectName: 'Xây dựng hệ thống cho thuê và quản lý homestay',
  advisor: 'Nguyễn Huy Cường',
  totalWeeks: 10,
};

// Weeks detailed data
const WEEKS_DATA = [
  {
    weekNum: 1,
    timeRange: 'Từ 12/10/2026 đến 18/10/2026',
    goal: 'Tuần đầu tiên tập trung vào việc tìm hiểu bài toán, xác định phạm vi và yêu cầu chung của hệ thống. Đây là nền tảng cho các giai đoạn phân tích, thiết kế và cài đặt ở những tuần tiếp theo.',
    tasks: [
      {
        stt: 1,
        name: 'Tìm hiểu tổng quan đề tài; xác định mục tiêu và phạm vi hệ thống',
        result: 'Xác định được mục tiêu chính là số hóa việc đăng tin, đặt phòng, quản lý lịch phòng và thanh toán cho homestay',
        status: 'Hoàn thành',
      },
      {
        stt: 2,
        name: 'Khảo sát các nền tảng cho thuê lưu trú phổ biến (ví dụ Airbnb, Booking.com)',
        result: 'Tổng hợp các chức năng thường gặp và những điểm có thể áp dụng cho quy mô homestay nhỏ',
        status: 'Hoàn thành',
      },
      {
        stt: 3,
        name: 'Tìm hiểu nghiệp vụ quản lý homestay',
        result: 'Mô tả được quy trình tiếp nhận yêu cầu, xác nhận đặt phòng, check-in, check-out, thu tiền và đánh giá sau lưu trú',
        status: 'Hoàn thành',
      },
      {
        stt: 4,
        name: 'Xác định các nhóm người dùng của hệ thống',
        result: 'Ba nhóm chính: khách thuê, chủ homestay và quản trị viên',
        status: 'Hoàn thành',
      },
      {
        stt: 5,
        name: 'Đọc tài liệu về phân tích yêu cầu phần mềm và kiến trúc ứng dụng web',
        result: 'Đã chọn hướng tiếp cận phân tích; đang hoàn thiện cách mô tả chức năng bằng biểu đồ use case',
        status: 'Đang thực hiện',
      },
      {
        stt: 6,
        name: 'Lập kế hoạch thực hiện đồ án trong 10 tuần',
        result: 'Có bảng phân chia công việc theo tuần, sẵn sàng trao đổi với giảng viên hướng dẫn',
        status: 'Hoàn thành',
      },
    ],
    results: [
      'Nắm được bối cảnh và nhu cầu quản lý homestay quy mô nhỏ, nơi việc ghi sổ, nhắn tin xác nhận và theo dõi lịch phòng vẫn còn làm thủ công.',
      'Xác định được phạm vi đồ án gồm các chức năng cốt lõi: quản lý thông tin phòng, quản lý đặt phòng, lịch phòng trống, thanh toán cơ bản và đánh giá của khách.',
      'Có danh sách các tác nhân (actor) và nghiệp vụ chính, làm đầu vào cho bước phân tích yêu cầu.',
    ],
    difficulties: [
      'Phạm vi đề tài khá rộng, dễ bị dàn trải. Hướng giải quyết: thống nhất với giảng viên hướng dẫn ưu tiên các chức năng cốt lõi cho phiên bản đầu; các tính năng mở rộng sẽ đưa vào phần hướng phát triển.',
      'Nghiệp vụ giữa các homestay khác nhau khá nhiều. Hướng giải quyết: chọn mô hình homestay tự quản lý làm trường hợp nghiên cứu chính để giảm độ phức tạp.',
    ],
    nextPlanTitle: '5. Kế hoạch tuần 2',
    nextPlan: [
      'Hoàn thiện danh sách yêu cầu chức năng và yêu cầu phi chức năng.',
      'Vẽ biểu đồ use case tổng quát và mô tả chi tiết cho các chức năng chính.',
      'Trao đổi với giảng viên hướng dẫn để xác nhận phạm vi đồ án trước khi chuyển sang giai đoạn thiết kế.',
    ],
  },
  {
    weekNum: 2,
    timeRange: 'Từ 19/10/2026 đến 25/10/2026',
    goal: 'Tuần thứ hai tập trung vào việc phân tích chi tiết các yêu cầu chức năng và phi chức năng của hệ thống homestay, xây dựng biểu đồ Use Case tổng quát và các kịch bản Use Case chi tiết cho từng tác nhân (khách thuê, chủ homestay, quản trị viên), đồng thời trao đổi với giảng viên hướng dẫn để chốt phạm vi trước khi bước vào giai đoạn thiết kế hệ thống.',
    tasks: [
      {
        stt: 1,
        name: 'Hoàn thiện danh sách yêu cầu chức năng (FR) cho các nhóm người dùng',
        result: 'Lập danh mục chi tiết các chức năng cốt lõi cho khách thuê (tìm phòng, đặt phòng), chủ homestay (đăng tin, duyệt lịch) và admin (quản lý người dùng, báo cáo)',
        status: 'Hoàn thành',
      },
      {
        stt: 2,
        name: 'Xác định các yêu cầu phi chức năng (NFR) của hệ thống',
        result: 'Xác định tiêu chuẩn về thời gian phản hồi, tính bảo mật dữ liệu, phân quyền bảo vệ tài khoản và tính tương thích giao diện web responsive',
        status: 'Hoàn thành',
      },
      {
        stt: 3,
        name: 'Xây dựng biểu đồ Use Case tổng quát của hệ thống',
        result: 'Hoàn thành sơ đồ Use Case bao quát toàn bộ các ca sử dụng chính và mối quan hệ giữa 3 tác nhân với hệ thống',
        status: 'Hoàn thành',
      },
      {
        stt: 4,
        name: 'Viết tài liệu đặc tả Use Case chi tiết cho các ca sử dụng cốt lõi',
        result: 'Hoàn thành kịch bản luồng sự kiện chính, luồng phụ, ngoại lệ cho: Đăng ký/Đăng nhập, Tìm kiếm homestay, Đặt phòng và Quản lý phòng',
        status: 'Hoàn thành',
      },
      {
        stt: 5,
        name: 'Báo cáo tiến độ và trao đổi với giảng viên hướng dẫn',
        result: 'Giảng viên hướng dẫn góp ý và chốt luồng quy trình duyệt đơn đặt phòng, hoàn thiện chính sách hủy phòng',
        status: 'Hoàn thành',
      },
      {
        stt: 6,
        name: 'Khảo sát mô hình dữ liệu và lựa chọn công cụ thiết kế CSDL (ERD)',
        result: 'Thống nhất mô hình dữ liệu quan hệ, lựa chọn công cụ vẽ ERD sẵn sàng cho giai đoạn thiết kế CSDL ở tuần 3',
        status: 'Hoàn thành',
      },
    ],
    results: [
      'Hoàn thiện bộ tài liệu phân tích yêu cầu phần mềm (SRS sơ bộ) cho hệ thống cho thuê và quản lý homestay.',
      'Biểu đồ Use Case tổng quát và các bản đặc tả ca sử dụng chính được xây dựng rõ ràng, chặt chẽ về mặt nghiệp vụ.',
      'Được giảng viên hướng dẫn thông qua kết quả phân tích yêu cầu, đồng ý chuyển sang giai đoạn thiết kế cơ sở dữ liệu và giao diện.',
    ],
    difficulties: [
      'Xử lý nghiệp vụ xung đột lịch phòng khi có nhiều khách cùng tiến hành đặt phòng một thời điểm. Hướng giải quyết: Đưa cơ chế khóa giữ chỗ tạm thời (lock phòng 15 phút) trong quá trình thanh toán vào tài liệu phân tích.',
      'Chính sách hoàn tiền và hủy phòng giữa khách thuê và chủ nhà có nhiều trường hợp ngoại lệ. Hướng giải quyết: Phân loại 2 chính sách hủy phòng rõ ràng (linh hoạt trước 48h và có tính phí sau 48h) để giảm độ phức tạp.',
    ],
    nextPlanTitle: '5. Kế hoạch tuần 3',
    nextPlan: [
      'Thiết kế mô hình dữ liệu quan hệ (sơ đồ ERD, thiết kế chi tiết các bảng dữ liệu, khóa chính, khóa ngoại, các ràng buộc toàn vẹn).',
      'Thiết kế giao diện người dùng (Wireframe / Mockup) cho các màn hình then chốt: Trang chủ, Danh sách homestay, Chi tiết phòng, Form đặt phòng và Bảng điều khiển quản lý.',
      'Khởi tạo khung mã nguồn dự án (cấu trúc thư mục, cấu hình môi trường phát triển và kết nối CSDL).',
    ],
  },
  {
    weekNum: 3,
    timeRange: 'Từ 26/10/2026 đến 01/11/2026',
    goal: 'Tập trung thiết kế cơ sở dữ liệu quan hệ hoàn chỉnh (ERD, từ điển dữ liệu) và thiết kế giao diện người dùng (UI/UX wireframes) cho các phân hệ của ứng dụng quản lý homestay.',
    tasks: [
      {
        stt: 1,
        name: 'Xây dựng sơ đồ thực thể mối quan hệ (ERD) cho hệ thống homestay',
        result: 'Hoàn thành sơ đồ quan hệ gồm các thực thể: Users, Homestay, Rooms, Bookings, Payments, Reviews',
        status: 'Chưa thực hiện',
      },
      {
        stt: 2,
        name: 'Thiết kế từ điển dữ liệu chi tiết cho từng bảng',
        result: 'Xác định đầy đủ kiểu dữ liệu, độ dài, khóa chính, khóa ngoại và ràng buộc kiểm tra (Check constraints)',
        status: 'Chưa thực hiện',
      },
      {
        stt: 3,
        name: 'Thiết kế Wireframe giao diện cho phân hệ khách thuê',
        result: 'Phác thảo các màn hình Trang chủ, Tìm kiếm phòng theo ngày/địa điểm, Xem chi tiết và Đặt phòng',
        status: 'Chưa thực hiện',
      },
      {
        stt: 4,
        name: 'Thiết kế Wireframe giao diện cho phân hệ chủ homestay & admin',
        result: 'Phác thảo màn hình quản lý danh sách phòng, xem lịch đặt, duyệt yêu cầu và báo cáo doanh thu',
        status: 'Chưa thực hiện',
      },
      {
        stt: 5,
        name: 'Trao đổi với giảng viên hướng dẫn về thiết kế CSDL và giao diện',
        result: 'Ghi nhận nhận xét của giảng viên để chuẩn hóa chuẩn 3NF và tối ưu hóa trải nghiệm người dùng',
        status: 'Chưa thực hiện',
      },
    ],
    results: [
      'Kế hoạch dự kiến: Có bản thiết kế CSDL chuẩn hóa (3NF) và bộ Wireframe UI/UX hoàn chỉnh.',
    ],
    difficulties: [
      'Thiết kế cấu trúc bảng quản lý giá phòng theo ngày lễ/cuối tuần có thể phức tạp. Hướng giải quyết: Tách bảng biểu giá riêng theo khoảng ngày hiệu lực.',
    ],
    nextPlanTitle: '5. Kế hoạch tuần 4',
    nextPlan: [
      'Cài đặt cơ sở dữ liệu vật lý trên hệ quản trị CSDL.',
      'Khởi tạo project Backend (API endpoints) và thiết lập mô hình MVC.',
      'Viết các API đăng ký, đăng nhập và xác thực JWT.',
    ],
  },
];

// Helper to create paragraphs
function createParagraph(text, options = {}) {
  const {
    bold = false,
    italics = false,
    size = 24, // 12pt
    align = AlignmentType.LEFT,
    spaceBefore = 60,
    spaceAfter = 60,
    lineSpacing = 276, // ~1.15
  } = options;

  return new Paragraph({
    alignment: align,
    spacing: {
      before: spaceBefore,
      after: spaceAfter,
      line: lineSpacing,
    },
    children: [
      new TextRun({
        text: text,
        font: FONT_NAME,
        size: size,
        bold: bold,
        italics: italics,
      }),
    ],
  });
}

function createBulletItem(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: {
      before: 40,
      after: 60,
      line: 276,
    },
    indent: {
      left: 360,
      hanging: 360,
    },
    children: [
      new TextRun({
        text: '•  ',
        font: FONT_NAME,
        size: 24,
        bold: true,
      }),
      new TextRun({
        text: text,
        font: FONT_NAME,
        size: 24,
      }),
    ],
  });
}

function createSectionHeading(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: {
      before: 180,
      after: 80,
    },
    children: [
      new TextRun({
        text: text,
        font: FONT_NAME,
        size: 25, // 12.5pt
        bold: true,
      }),
    ],
  });
}

// Function to generate the week report content elements
function generateWeekElements(weekData, info = DEFAULT_INFO) {
  const elements = [];

  // Header: School & Faculty
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 },
      children: [
        new TextRun({
          text: info.school,
          font: FONT_NAME,
          size: 24, // 12pt
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 180 },
      children: [
        new TextRun({
          text: info.faculty,
          font: FONT_NAME,
          size: 24, // 12pt
          bold: true,
        }),
      ],
    })
  );

  // Document Title
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 60 },
      children: [
        new TextRun({
          text: info.title,
          font: FONT_NAME,
          size: 28, // 14pt
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 100 },
      children: [
        new TextRun({
          text: `TUẦN ${weekData.weekNum}`,
          font: FONT_NAME,
          size: 28, // 14pt
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 220 },
      children: [
        new TextRun({
          text: `Đề tài: ${info.projectName}`,
          font: FONT_NAME,
          size: 24, // 12pt
          italics: true,
        }),
      ],
    })
  );

  // Table: Student & Topic Info
  const infoRows = [
    ['Họ và tên sinh viên', info.studentName],
    ['Mã số sinh viên', info.studentId],
    ['Lớp', info.className],
    ['Đề tài', info.projectName],
    ['Giảng viên hướng dẫn', info.advisor],
    [`Thời gian tuần ${weekData.weekNum}`, weekData.timeRange],
    ['Tuần báo cáo', `${weekData.weekNum} / ${info.totalWeeks}`],
  ];

  const infoTableRows = infoRows.map(([label, val]) => {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 3200, type: WidthType.DXA },
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              spacing: { before: 40, after: 40 },
              children: [
                new TextRun({
                  text: label,
                  font: FONT_NAME,
                  size: 24,
                  bold: true,
                }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: 5800, type: WidthType.DXA },
          margins: CELL_MARGINS,
          children: [
            new Paragraph({
              spacing: { before: 40, after: 40 },
              children: [
                new TextRun({
                  text: val,
                  font: FONT_NAME,
                  size: 24,
                }),
              ],
            }),
          ],
        }),
      ],
    });
  });

  const infoTable = new Table({
    width: { size: 9000, type: WidthType.DXA },
    borders: TABLE_BORDERS,
    rows: infoTableRows,
  });

  elements.push(infoTable);

  // 1. Mục tiêu của tuần
  elements.push(
    createSectionHeading(`1. Mục tiêu của tuần ${weekData.weekNum}`),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 40, after: 120, line: 276 },
      children: [
        new TextRun({
          text: weekData.goal,
          font: FONT_NAME,
          size: 24,
        }),
      ],
    })
  );

  // 2. Công việc đã thực hiện
  elements.push(createSectionHeading('2. Công việc đã thực hiện'));

  const headerCells = [
    { text: 'STT', width: 700, align: AlignmentType.CENTER },
    { text: 'Công việc', width: 3300, align: AlignmentType.CENTER },
    { text: 'Kết quả đạt được', width: 3800, align: AlignmentType.CENTER },
    { text: 'Tình trạng', width: 1200, align: AlignmentType.CENTER },
  ].map((h) => {
    return new TableCell({
      width: { size: h.width, type: WidthType.DXA },
      shading: {
        fill: 'EDEDED',
        type: ShadingType.CLEAR,
      },
      margins: CELL_MARGINS,
      children: [
        new Paragraph({
          alignment: h.align,
          spacing: { before: 60, after: 60 },
          children: [
            new TextRun({
              text: h.text,
              font: FONT_NAME,
              size: 24,
              bold: true,
            }),
          ],
        }),
      ],
    });
  });

  const taskRows = [new TableRow({ children: headerCells })];

  weekData.tasks.forEach((t) => {
    taskRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 700, type: WidthType.DXA },
            margins: CELL_MARGINS,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 40, after: 40 },
                children: [
                  new TextRun({
                    text: String(t.stt),
                    font: FONT_NAME,
                    size: 23,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 3300, type: WidthType.DXA },
            margins: CELL_MARGINS,
            children: [
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: { before: 40, after: 40, line: 260 },
                children: [
                  new TextRun({
                    text: t.name,
                    font: FONT_NAME,
                    size: 23,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 3800, type: WidthType.DXA },
            margins: CELL_MARGINS,
            children: [
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: { before: 40, after: 40, line: 260 },
                children: [
                  new TextRun({
                    text: t.result,
                    font: FONT_NAME,
                    size: 23,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 1200, type: WidthType.DXA },
            margins: CELL_MARGINS,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 40, after: 40 },
                children: [
                  new TextRun({
                    text: t.status,
                    font: FONT_NAME,
                    size: 23,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  });

  const workTable = new Table({
    width: { size: 9000, type: WidthType.DXA },
    borders: TABLE_BORDERS,
    rows: taskRows,
  });

  elements.push(workTable);

  // 3. Kết quả đạt được
  elements.push(createSectionHeading('3. Kết quả đạt được'));
  weekData.results.forEach((r) => {
    elements.push(createBulletItem(r));
  });

  // 4. Khó khăn và hướng giải quyết
  elements.push(createSectionHeading('4. Khó khăn và hướng giải quyết'));
  weekData.difficulties.forEach((d) => {
    elements.push(createBulletItem(d));
  });

  // 5. Kế hoạch tuần tiếp theo
  elements.push(createSectionHeading(weekData.nextPlanTitle));
  weekData.nextPlan.forEach((p) => {
    elements.push(createBulletItem(p));
  });

  // 6. Nhận xét của giảng viên hướng dẫn
  elements.push(
    createSectionHeading('6. Nhận xét của giảng viên hướng dẫn'),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({
          text: '................................................................................................................................................................................',
          font: FONT_NAME,
          size: 22,
          color: '888888',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({
          text: '................................................................................................................................................................................',
          font: FONT_NAME,
          size: 22,
          color: '888888',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({
          text: '................................................................................................................................................................................',
          font: FONT_NAME,
          size: 22,
          color: '888888',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({
          text: '................................................................................................................................................................................',
          font: FONT_NAME,
          size: 22,
          color: '888888',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 60, after: 140 },
      children: [
        new TextRun({
          text: '................................................................................................................................................................................',
          font: FONT_NAME,
          size: 22,
          color: '888888',
        }),
      ],
    })
  );

  // NOTE: Bỏ hoàn toàn phần ký họ tên của giảng viên và sinh viên theo yêu cầu!

  return elements;
}

// Function to build single week document
async function buildSingleWeekDoc(weekData, outputPath, info = DEFAULT_INFO) {
  const elements = generateWeekElements(weekData, info);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134, // 2cm
              bottom: 1134, // 2cm
              left: 1700, // 3cm
              right: 1134, // 2cm
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT_NAME,
                    size: 22,
                  }),
                ],
              }),
            ],
          }),
        },
        children: elements,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath} (${buffer.length} bytes)`);
}

// Function to build multi-week combined document
async function buildMultiWeekDoc(weeksList, outputPath, info = DEFAULT_INFO) {
  const sections = weeksList.map((weekData) => {
    return {
      properties: {
        page: {
          margin: {
            top: 1134,
            bottom: 1134,
            left: 1700,
            right: 1134,
          },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: FONT_NAME,
                  size: 22,
                }),
              ],
            }),
          ],
        }),
      },
      children: generateWeekElements(weekData, info),
    };
  });

  const doc = new Document({
    sections: sections,
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath} (${buffer.length} bytes)`);
}

// Main execution
async function main() {
  const outputDir = path.resolve(__dirname, '..');

  const fileWeek1 = path.join(outputDir, 'Bao_Cao_Tien_Do_Tuan_1.docx');
  const fileWeek2 = path.join(outputDir, 'Bao_Cao_Tien_Do_Tuan_2.docx');
  const fileCombined = path.join(outputDir, 'Bao_Cao_Tien_Do_Tuan_1_va_Tuan_2.docx');
  const fileMultiWeeks = path.join(outputDir, 'Bao_Cao_Tien_Do_Nhieu_Tuan_Mau.docx');

  // Generate Week 1 individual
  await buildSingleWeekDoc(WEEKS_DATA[0], fileWeek1);

  // Generate Week 2 individual
  await buildSingleWeekDoc(WEEKS_DATA[1], fileWeek2);

  // Generate Combined Week 1 & 2
  await buildMultiWeekDoc([WEEKS_DATA[0], WEEKS_DATA[1]], fileCombined);

  // Generate Multi-Week full document (Week 1, Week 2, Week 3 template)
  await buildMultiWeekDoc(WEEKS_DATA, fileMultiWeeks);

  console.log('All reports generated successfully!');
}

main().catch(console.error);
