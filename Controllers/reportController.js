const Response = require('../Models/ResponseSchema');
const XLSX = require('xlsx');
const fs = require('fs');

// Fetch all reports
exports.getReports = async (req, res, next) => {
    console.log("inside get reports");
    try {
        const reports = await Response.find();
        res.status(200).json(reports);
    } catch (error) {
        return next(error);
    }
};

exports.downloadReport = async (req, res) => {
    console.log("inside download report controller");
    const { reportId, format } = req.params;

    try {
        const report = await Response.findById(reportId);

        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }


        // Send the chatResponse as JSON response

        const jsonArray = report.chatResponse;

        // Convert JSON array to worksheet
        const worksheet = XLSX.utils.json_to_sheet(jsonArray);


        if (format === 'excel') {



            // Create a workbook and add the worksheet
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet 1');

            // Write XLSX (Excel) file
            XLSX.writeFile(workbook, 'output.xlsx');



            console.log('XLSX file has been created successfully.');


            return res.status(200).json({

                message: 'xlsx file created successfully'
            });
        } else if (format === 'csv') {
            // Convert JSON array to CSV format
            const csv = XLSX.utils.sheet_to_csv(worksheet);

            // Write CSV file
            fs.writeFileSync('output.csv', csv, 'utf-8');

            console.log('CSV file has been created successfully.');

            
            return res.status(200).json({

                message: 'csv file created successfully'
            });


        } else {


            return res.status(400).json({ message: 'Invalid format' });
        }
    } catch (error) {
        console.error('Error fetching report:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
