import csv
import os


# Function to append data to the CSV file
def append_to_csv(data, file_path):
    file_exists = os.path.isfile(file_path)
    with open(file_path, mode="a", newline="") as csv_file:
        fieldnames = [
            "Opportunity",
            "Contact Name",
            "Email",
            "Job Position",
            "Company Name",
            "Country",
            "Phone",
            "Notes",
            "Tags",
            "Campaign",
            "Source",
        ]
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)

        if not file_exists:
            writer.writeheader()

        writer.writerow(data)
